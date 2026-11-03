data "aws_cloudfront_cache_policy" "disabled" {
  name = local.spec.cloudFront.cachePolicies.default
}

data "aws_cloudfront_origin_request_policy" "alb" {
  name = local.spec.cloudFront.origins.alb.originRequestPolicy
}

data "aws_cloudfront_origin_request_policy" "external" {
  for_each = local.external_origins
  name     = each.value.originRequestPolicy
}

locals {
  origin_cache     = local.spec.cloudFront.cachePolicies["coss-origin-cache-control"]
  external_origins = { for name, origin in local.spec.cloudFront.origins : name => origin if name != "alb" }
  origin_request_policy_ids = merge(
    { alb = data.aws_cloudfront_origin_request_policy.alb.id },
    { for name, policy in data.aws_cloudfront_origin_request_policy.external : name => policy.id },
  )
}

# Honours the origin's Cache-Control; Next's Vary headers and every query string (`_rsc`) are in
# the key.
resource "aws_cloudfront_cache_policy" "origin" {
  name        = "${local.name}-origin-cache-control"
  min_ttl     = local.origin_cache.MinTTL
  default_ttl = local.origin_cache.DefaultTTL
  max_ttl     = local.origin_cache.MaxTTL

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = local.origin_cache.enableAcceptEncodingGzip
    enable_accept_encoding_brotli = local.origin_cache.enableAcceptEncodingBrotli
    cookies_config {
      cookie_behavior = local.origin_cache.cookies
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = local.origin_cache.headers
      }
    }
    query_strings_config {
      query_string_behavior = local.origin_cache.queryStrings
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "hsts" {
  name = "${local.name}-hsts"
  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

# --- coss.com: dashboard + site (ALB), coss ui, Origin UI and qnot (their own origins) ---------

resource "aws_cloudfront_distribution" "dashboard" {
  depends_on = [aws_s3_bucket_acl.access_logs, aws_s3_bucket_policy.access_logs]

  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All"
  aliases         = [var.dashboard_host]
  web_acl_id      = aws_wafv2_web_acl.edge["dashboard"].arn
  comment         = "${var.dashboard_host} (${var.stage})"

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
      name  = local.spec.cloudFront.origins.alb.customHeader.HeaderName
      value = random_password.origin_verify.result
    }
  }

  dynamic "origin" {
    for_each = local.external_origins
    content {
      origin_id   = origin.key
      domain_name = var.external_origin_hosts[origin.key]
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Dashboard, auth, server actions and the landing page (a path pattern can't match exactly /).
  default_cache_behavior {
    target_origin_id           = "alb"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = local.origin_request_policy_ids.alb
    response_headers_policy_id = aws_cloudfront_response_headers_policy.hsts.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.spec.cloudFront.distributions["coss.com"].cachedBehaviours
    content {
      path_pattern               = ordered_cache_behavior.value.pathPattern
      target_origin_id           = ordered_cache_behavior.value.origin
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = aws_cloudfront_cache_policy.origin.id
      origin_request_policy_id   = local.origin_request_policy_ids[ordered_cache_behavior.value.origin]
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
    prefix          = "cloudfront/coss.com/"
    include_cookies = false
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# --- api.coss.com: never cached --------------------------------------------------------------

resource "aws_cloudfront_distribution" "api" {
  depends_on = [aws_s3_bucket_acl.access_logs, aws_s3_bucket_policy.access_logs]

  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All"
  aliases         = [var.api_host]
  web_acl_id      = aws_wafv2_web_acl.edge["api"].arn
  comment         = "${var.api_host} (${var.stage})"

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
      name  = local.spec.cloudFront.origins.alb.customHeader.HeaderName
      value = random_password.origin_verify.result
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
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    bucket          = aws_s3_bucket.access_logs.bucket_domain_name
    prefix          = "cloudfront/api.coss.com/"
    include_cookies = false
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
