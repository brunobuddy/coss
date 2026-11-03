# One CLOUDFRONT web ACL per distribution: AWS managed rule groups plus a per-IP flood limit (the
# apps rate-limit precisely in Valkey). Body rules that legitimate traffic trips are counted, not
# blocked: API sends carry whole HTML emails (often > 8 KB, sometimes script-like markup), SDKs
# on some runtimes send no User-Agent, and sandboxes allow localhost origins. Those last bodies trip
# EC2MetaDataSSRF_BODY, which outbound delivery doesn't rely on: it refuses private addresses itself.
# Hosted pages take what people type (Forms screens it itself). Tracking links are opened by shared
# mail proxies and scanners, which often send no User-Agent.
locals {
  waf = {
    dashboard = {
      rate_limit      = var.waf_rate_limits.dashboard
      count_overrides = ["SizeRestrictions_BODY", "EC2MetaDataSSRF_BODY"]
    }
    hosted = {
      rate_limit      = var.waf_rate_limits.hosted
      count_overrides = ["SizeRestrictions_BODY", "CrossSiteScripting_BODY", "EC2MetaDataSSRF_BODY", "GenericRFI_BODY", "GenericLFI_BODY"]
    }
    tracking = {
      rate_limit      = var.waf_rate_limits.tracking
      count_overrides = ["NoUserAgent_HEADER"]
    }
    api = {
      rate_limit      = var.waf_rate_limits.api
      count_overrides = ["SizeRestrictions_BODY", "CrossSiteScripting_BODY", "NoUserAgent_HEADER", "EC2MetaDataSSRF_BODY"]
    }
  }
}

resource "aws_wafv2_web_acl" "edge" {
  for_each = local.waf
  provider = aws.us_east_1
  name     = "${local.name}-${each.key}"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 0
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = each.value.rate_limit
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-${each.key}-rate"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-ip-reputation"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-${each.key}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        dynamic "rule_action_override" {
          for_each = each.value.count_overrides
          content {
            name = rule_action_override.value
            action_to_use {
              count {}
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-${each.key}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-${each.key}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-${each.key}"
    sampled_requests_enabled   = true
  }
}
