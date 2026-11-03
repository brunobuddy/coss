resource "aws_lb" "main" {
  name                       = local.name
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = [for subnet in aws_subnet.public : subnet.id]
  security_groups            = [aws_security_group.alb_cloudfront.id, aws_security_group.alb_cloudflare.id]
  idle_timeout               = local.spec.alb.idleTimeoutSeconds
  drop_invalid_header_fields = true
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "service" {
  for_each             = local.lb_services
  name                 = "${local.name}-${each.key}"
  vpc_id               = aws_vpc.main.id
  target_type          = "ip"
  protocol             = "HTTP"
  port                 = each.value.port
  deregistration_delay = 30

  # A new task serves after two passing checks (~10 s instead of ~30 s: rollouts wait for it); it
  # still takes ~30 s of failing checks to take one out (the health routes touch no database).
  health_check {
    path                = each.value.healthCheckPath
    matcher             = "200"
    interval            = 5
    timeout             = 4
    healthy_threshold   = 2
    unhealthy_threshold = 6
  }
}

# A request without CloudFront's (or Cloudflare's, for tracking) origin header matches no rule.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      status_code  = local.spec.alb.httpsListener.defaultAction.FixedResponseConfig.StatusCode
    }
  }
}

locals {
  header_secrets = {
    "<origin-verify-secret>"            = random_password.origin_verify.result
    "<tracking-origin-verify-secret>"   = random_password.tracking_origin_verify.result
    "<portal-origin-verify-secret>"     = random_password.portal_origin_verify.result
    "<sign-origin-verify-secret>"       = random_password.sign_origin_verify.result
    "<forms-origin-verify-secret>"      = random_password.forms_origin_verify.result
    "<scheduling-origin-verify-secret>" = random_password.scheduling_origin_verify.result
  }
}

# Exactly the rules printed by the spec (priorities, conditions), placeholders filled in.
resource "aws_lb_listener_rule" "spec" {
  for_each     = { for rule in local.spec.alb.httpsListener.rules : tostring(rule.priority) => rule }
  listener_arn = aws_lb_listener.https.arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.value.targetGroup].arn
  }

  dynamic "condition" {
    for_each = [for condition in each.value.conditions : condition if condition.Field == "host-header"]
    content {
      host_header {
        values = condition.value.HostHeaderConfig.Values
      }
    }
  }

  dynamic "condition" {
    for_each = [for condition in each.value.conditions : condition if condition.Field == "path-pattern"]
    content {
      path_pattern {
        values = condition.value.PathPatternConfig.Values
      }
    }
  }

  dynamic "condition" {
    for_each = [for condition in each.value.conditions : condition if condition.Field == "http-header"]
    content {
      http_header {
        http_header_name = condition.value.HttpHeaderConfig.HttpHeaderName
        values           = [for value in condition.value.HttpHeaderConfig.Values : local.header_secrets[value]]
      }
    }
  }
}

# The Hooks portal's host, served by the same listener (SNI): Cloudflare connects with it and
# validates this certificate (SSL mode Full (strict)).
resource "aws_lb_listener_certificate" "portal" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.portal.certificate_arn
}

# Sign's signing app's host, on the same listener (SNI) like the portal's.
resource "aws_lb_listener_certificate" "sign" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.sign.certificate_arn
}

# Forms' host (the api's `/f/*`), on the same listener (SNI) too.
resource "aws_lb_listener_certificate" "forms" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.forms.certificate_arn
}

# Scheduling's hosted pages' host, on the same listener (SNI) too.
resource "aws_lb_listener_certificate" "scheduling" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate_validation.scheduling.certificate_arn
}
