# The registrable domains kept apart from coss.com. The load balancer's rules for them are unchanged:
# each distribution sends its host's origin header, and CloudFront validates the load balancer's
# certificate for that host. Validation CNAMEs: `terraform output edge_certificate_validation_records`.
locals {
  hosted = local.spec.cloudFront.hostedDistributions
}

resource "aws_acm_certificate" "hosted_edge" {
  for_each          = local.hosted
  provider          = aws.us_east_1
  domain_name       = each.value.host
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "hosted_edge" {
  for_each        = local.hosted
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.hosted_edge[each.key].arn
}

resource "aws_acm_certificate" "redirects" {
  provider                  = aws.us_east_1
  domain_name               = keys(local.spec.cloudFront.hostedRedirects)[0]
  subject_alternative_names = slice(keys(local.spec.cloudFront.hostedRedirects), 1, length(local.spec.cloudFront.hostedRedirects))
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "redirects" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.redirects.arn
}

# CloudFront validates the origin's certificate against the host, which Cloudflare's Full mode didn't.
resource "aws_acm_certificate" "tracking" {
  domain_name       = local.hosted.tracking.host
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "tracking" {
  certificate_arn = aws_acm_certificate.tracking.arn
}

resource "aws_lb_listener_certificate" "tracking" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.tracking.certificate_arn
}

resource "aws_cloudfront_function" "forms_paths" {
  name    = "${local.name}-forms-paths"
  runtime = "cloudfront-js-2.0"
  comment = "The forms host only serves /f/*"
  publish = true
  code    = <<-JS
    function handler(event) {
      var uri = event.request.uri;
      if (uri === "/f" || uri.indexOf("/f/") === 0) return event.request;
      return {
        statusCode: 302,
        statusDescription: "Found",
        headers: { location: { value: ${jsonencode(local.spec.cloudFront.formsOtherPathsRedirect)} } },
      };
    }
  JS
}

resource "aws_cloudfront_function" "redirects" {
  name    = "${local.name}-redirects"
  runtime = "cloudfront-js-2.0"
  comment = "Hosts that only redirect"
  publish = true
  code    = <<-JS
    var REDIRECTS = ${jsonencode(local.spec.cloudFront.hostedRedirects)};
    function handler(event) {
      var request = event.request;
      var redirect = REDIRECTS[request.headers.host.value];
      if (!redirect) return { statusCode: 404, statusDescription: "Not Found" };
      var location = redirect.to + "/";
      if (redirect.keepPath) {
        var query = Object.keys(request.querystring).map(function (name) {
          var value = request.querystring[name];
          return value.value === "" ? name : name + "=" + value.value;
        }).join("&");
        location = redirect.to + request.uri + (query ? "?" + query : "");
      }
      return {
        statusCode: 301,
        statusDescription: "Moved Permanently",
        headers: { location: { value: location } },
      };
    }
  JS
}

resource "aws_cloudfront_distribution" "hosted" {
  for_each   = local.hosted
  depends_on = [aws_s3_bucket_acl.access_logs, aws_s3_bucket_policy.access_logs]

  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All"
  aliases         = [each.value.host]
  web_acl_id      = aws_wafv2_web_acl.edge[each.value.waf].arn
  comment         = "${each.value.host} (${var.stage})"

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 30
    }
    custom_header {
      name  = each.value.originVerifyHeader
      value = local.header_secrets[each.value.originVerifySecret]
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = local.origin_request_policy_ids.alb
    response_headers_policy_id = aws_cloudfront_response_headers_policy.hsts.id

    dynamic "function_association" {
      for_each = each.key == "forms" ? [aws_cloudfront_function.forms_paths.arn] : []
      content {
        event_type   = "viewer-request"
        function_arn = function_association.value
      }
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = each.value.cachedBehaviours
    content {
      path_pattern               = ordered_cache_behavior.value.pathPattern
      target_origin_id           = ordered_cache_behavior.value.origin
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = aws_cloudfront_cache_policy.origin.id
      origin_request_policy_id   = local.origin_request_policy_ids.alb
      response_headers_policy_id = aws_cloudfront_response_headers_policy.hsts.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    bucket          = aws_s3_bucket.access_logs.bucket_domain_name
    prefix          = "cloudfront/${each.value.host}/"
    include_cookies = false
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.hosted_edge[each.key].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_cloudfront_distribution" "redirects" {
  depends_on = [aws_s3_bucket_acl.access_logs, aws_s3_bucket_policy.access_logs]

  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All"
  aliases         = keys(local.spec.cloudFront.hostedRedirects)
  web_acl_id      = aws_wafv2_web_acl.edge["hosted"].arn
  comment         = "Redirect-only hosts (${var.stage})"

  # Never reached: the function answers every request. No origin header, so the load balancer refuses it.
  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = local.origin_request_policy_ids.alb

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.redirects.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    bucket          = aws_s3_bucket.access_logs.bucket_domain_name
    prefix          = "cloudfront/redirects/"
    include_cookies = false
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.redirects.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# --- Customers' tracking domains ------------------------------------------------------------------

# Each customer domain is a tenant of this distribution (`@coss/email`'s CloudFront provider). Tenants'
# hosts aren't on the load balancer's certificate, so the origin is reached by a name of its own.
resource "aws_acm_certificate" "tracking_origin" {
  domain_name       = "tracking-origin.cosslinks.com"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "tracking_origin" {
  certificate_arn = aws_acm_certificate.tracking_origin.arn
}

resource "aws_lb_listener_certificate" "tracking_origin" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.tracking_origin.certificate_arn
}

resource "aws_cloudfront_connection_group" "tracking" {
  name         = "${local.name}-tracking"
  enabled      = true
  ipv6_enabled = true
}

resource "aws_cloudfront_multitenant_distribution" "tracking" {
  comment      = "Customers' tracking domains (${var.stage})"
  enabled      = true
  http_version = "http2and3"
  web_acl_id   = aws_wafv2_web_acl.edge["tracking"].arn

  origin {
    id          = "alb"
    domain_name = aws_acm_certificate.tracking_origin.domain_name
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 30
    }
    custom_header {
      header_name  = local.hosted.tracking.originVerifyHeader
      header_value = local.header_secrets[local.hosted.tracking.originVerifySecret]
    }
  }

  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.tenant.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.hsts.id
    allowed_methods {
      items          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods = ["GET", "HEAD"]
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tenant_config {}
}

data "aws_cloudfront_origin_request_policy" "tenant" {
  name = "Managed-AllViewerExceptHostHeader"
}

output "tracking_tenants" {
  description = "TRACKING_DISTRIBUTION_ID, TRACKING_CONNECTION_GROUP_ID and TRACKING_CNAME_TARGET."
  value = {
    distribution_id     = aws_cloudfront_multitenant_distribution.tracking.id
    connection_group_id = aws_cloudfront_connection_group.tracking.id
    cname_target        = aws_cloudfront_connection_group.tracking.routing_endpoint
  }
}

resource "aws_iam_role_policy" "task_tracking_domains" {
  for_each = toset(["web", "api", "worker"])
  name     = "tracking-domains"
  role     = aws_iam_role.task[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateDistributionTenant"]
        Resource = "*"
      },
      # CloudFront requests and attaches tenants' certificates with the caller's permissions.
      {
        Effect   = "Allow"
        Action   = ["acm:RequestCertificate", "acm:DescribeCertificate"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "cloudfront:GetDistributionTenant",
          "cloudfront:GetManagedCertificateDetails",
          "cloudfront:UpdateDistributionTenant",
          "cloudfront:DeleteDistributionTenant",
        ]
        Resource = "arn:aws:cloudfront::${var.account_id}:distribution-tenant/*"
      },
    ]
  })
}
