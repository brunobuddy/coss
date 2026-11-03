# Production's security monitoring; the org-wide audit trail and what must survive a compromised
# production account live in infra/organization. `/admin/security` shows all of it.

# --- Access logs -------------------------------------------------------------------------------

# Load balancer, CloudFront and VPC flow logs, plus Config's snapshots. They hold IPs and URLs, so
# they are kept for RETENTION_DAYS.accessLogs (@coss/retention, published). CloudFront's legacy
# delivery needs ACLs; ALB delivery needs SSE-S3.
resource "aws_s3_bucket" "access_logs" {
  bucket = "${local.name}-access-logs-${var.account_id}"
}

resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

data "aws_canonical_user_id" "current" {}

resource "aws_s3_bucket_acl" "access_logs" {
  depends_on = [aws_s3_bucket_ownership_controls.access_logs]
  bucket     = aws_s3_bucket.access_logs.id
  access_control_policy {
    owner {
      id = data.aws_canonical_user_id.current.id
    }
    grant {
      permission = "FULL_CONTROL"
      grantee {
        type = "CanonicalUser"
        id   = data.aws_canonical_user_id.current.id
      }
    }
    # awslogsdelivery, CloudFront's log writer.
    grant {
      permission = "FULL_CONTROL"
      grantee {
        type = "CanonicalUser"
        id   = "c4c1ede66af53448b93c283ce9448c4ba468c9432aa01d700d3878632f77d2d0"
      }
    }
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    id     = "retention"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_elb_service_account" "main" {}

data "aws_iam_policy_document" "access_logs" {
  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.access_logs.arn, "${aws_s3_bucket.access_logs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
  statement {
    sid       = "LoadBalancerLogs"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.access_logs.arn}/alb/AWSLogs/${var.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.main.arn]
    }
  }
  statement {
    sid       = "ServiceLogsCheckBucket"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.access_logs.arn]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com", "config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
  statement {
    sid     = "ServiceLogsWrite"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.access_logs.arn}/vpc-flow/AWSLogs/${var.account_id}/*",
      "${aws_s3_bucket.access_logs.arn}/config/AWSLogs/${var.account_id}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com", "config.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
  }
}

resource "aws_s3_bucket_policy" "access_logs" {
  depends_on = [aws_s3_bucket_public_access_block.access_logs]
  bucket     = aws_s3_bucket.access_logs.id
  policy     = data.aws_iam_policy_document.access_logs.json
}

resource "aws_flow_log" "main" {
  depends_on               = [aws_s3_bucket_policy.access_logs]
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = "${aws_s3_bucket.access_logs.arn}/vpc-flow"
  max_aggregation_interval = 600
  destination_options {
    file_format        = "parquet"
    per_hour_partition = true
  }
}

# --- Threat detection and configuration checks ---------------------------------------------------

# Only this region: the organization's SCP denies these services everywhere else, so nothing else
# can run there either. Runtime monitoring would add an agent to every task; it stays off.
resource "aws_guardduty_detector" "main" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_guardduty_detector_feature" "main" {
  for_each = {
    S3_DATA_EVENTS         = "ENABLED"
    RDS_LOGIN_EVENTS       = "ENABLED"
    EBS_MALWARE_PROTECTION = "DISABLED"
    LAMBDA_NETWORK_LOGS    = "DISABLED"
    EKS_AUDIT_LOGS         = "DISABLED"
  }
  detector_id = aws_guardduty_detector.main.id
  name        = each.key
  status      = each.value

  # AWS turns on sub-features of its own; changing one needs the monitoring SCP detached anyway.
  lifecycle {
    ignore_changes = [additional_configuration]
  }
}

resource "aws_securityhub_account" "main" {
  enable_default_standards  = false
  control_finding_generator = "SECURITY_CONTROL"
  auto_enable_controls      = true
}

resource "aws_securityhub_standards_subscription" "foundational" {
  depends_on    = [aws_securityhub_account.main]
  standards_arn = "arn:aws:securityhub:${var.region}::standards/aws-foundational-security-best-practices/v/1.0.0"
}

resource "aws_iam_service_linked_role" "config" {
  aws_service_name = "config.amazonaws.com"
}

resource "aws_config_configuration_recorder" "main" {
  name     = local.name
  role_arn = aws_iam_service_linked_role.config.arn
  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
  # Tasks' network interfaces come and go with every deploy and scale-out; Config bills per change.
  recording_mode {
    recording_frequency = "CONTINUOUS"
    recording_mode_override {
      description         = "Churn with deploys and autoscaling"
      resource_types      = ["AWS::EC2::NetworkInterface"]
      recording_frequency = "DAILY"
    }
  }
}

resource "aws_config_delivery_channel" "main" {
  depends_on     = [aws_config_configuration_recorder.main, aws_s3_bucket_policy.access_logs]
  name           = local.name
  s3_bucket_name = aws_s3_bucket.access_logs.id
  s3_key_prefix  = "config"
}

resource "aws_config_configuration_recorder_status" "main" {
  depends_on = [aws_config_delivery_channel.main]
  name       = aws_config_configuration_recorder.main.name
  is_enabled = true
}

# --- Alerts: what must wake someone up, to the coss-alerts email ----------------------------------

# Replaces the topic's policy, so it repeats SNS's default (CloudWatch alarms rely on it).
data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid = "AccountOwner"
    actions = [
      "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission",
      "SNS:DeleteTopic", "SNS:Subscribe", "SNS:ListSubscriptionsByTopic", "SNS:Publish",
    ]
    resources = [data.aws_sns_topic.alerts.arn]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [var.account_id]
    }
  }
  statement {
    sid       = "SecurityEvents"
    actions   = ["SNS:Publish"]
    resources = [data.aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:events:${var.region}:${var.account_id}:rule/${local.name}-security-*"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = data.aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

# The management account forwards its own security events here (infra/organization).
resource "aws_cloudwatch_event_bus_policy" "default" {
  event_bus_name = "default"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "ManagementAccountSecurityEvents"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.management_account_id}:root" }
      Action    = "events:PutEvents"
      Resource  = "arn:aws:events:${var.region}:${var.account_id}:event-bus/default"
    }]
  })
}

locals {
  security_alerts = {
    threat = {
      description = "GuardDuty found a high or critical threat"
      pattern = {
        source        = ["aws.guardduty"]
        "detail-type" = ["GuardDuty Finding"]
        detail        = { severity = [{ numeric = [">=", 7] }] }
      }
      paths = {
        account = "$.account", title = "$.detail.title", severity = "$.detail.severity"
      }
      message = "AWS security alert: <title> (severity <severity> of 10, account <account>). See https://coss.com/admin/security"
    }
    root = {
      description = "Someone used the root user"
      pattern = {
        "detail-type" = ["AWS Console Sign In via CloudTrail", "AWS API Call via CloudTrail"]
        detail        = { userIdentity = { type = ["Root"] } }
      }
      paths = {
        account = "$.account", event = "$.detail.eventName", ip = "$.detail.sourceIPAddress"
      }
      message = "AWS security alert: the root user of account <account> did <event> from <ip>. If that wasn't you, act now. See https://coss.com/admin/security"
    }
    audit-trail = {
      description = "Someone changed the audit trail"
      pattern = {
        source        = ["aws.cloudtrail"]
        "detail-type" = ["AWS API Call via CloudTrail"]
        detail = {
          eventName = ["StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors"]
        }
      }
      paths = {
        account = "$.account", event = "$.detail.eventName", who = "$.detail.userIdentity.arn"
      }
      message = "AWS security alert: <who> did <event> on the audit trail in account <account>. See https://coss.com/admin/security"
    }
    outside-access = {
      description = "A resource became reachable from outside the organization"
      pattern = {
        source        = ["aws.access-analyzer"]
        "detail-type" = ["Access Analyzer Finding"]
        detail        = { status = ["ACTIVE"] }
      }
      paths = {
        account = "$.detail.accountId", resource = "$.detail.resource"
      }
      message = "AWS security alert: <resource> in account <account> can be reached from outside the organization. See https://coss.com/admin/security"
    }
  }
}

resource "aws_cloudwatch_event_rule" "security" {
  for_each      = local.security_alerts
  name          = "${local.name}-security-${each.key}"
  description   = each.value.description
  event_pattern = jsonencode(each.value.pattern)
}

resource "aws_cloudwatch_event_target" "security" {
  for_each = local.security_alerts
  rule     = aws_cloudwatch_event_rule.security[each.key].name
  arn      = data.aws_sns_topic.alerts.arn
  input_transformer {
    input_paths    = each.value.paths
    input_template = jsonencode(each.value.message)
  }
}

# --- Encryption of what's left --------------------------------------------------------------------

# SES events and inbound notifications name recipients. A customer key, because the AWS-managed SNS
# key can't be used by the services that publish: a publisher missing here loses its messages silently.
resource "aws_kms_key" "sns" {
  description             = "${local.name}: SNS topics"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Account"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid    = "Publishers"
        Effect = "Allow"
        Principal = {
          Service = ["ses.amazonaws.com", "cloudwatch.amazonaws.com", "events.amazonaws.com"]
        }
        Action   = ["kms:GenerateDataKey*", "kms:Decrypt"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "sns" {
  name          = "alias/${local.name}-sns"
  target_key_id = aws_kms_key.sns.key_id
}

locals {
  # Created by ses:bootstrap, which keeps their policies and subscriptions.
  sns_topics = toset(["${var.ses_name}-alerts", "${var.ses_name}-ses-events", "${var.ses_name}-ses-inbound"])
}

import {
  for_each = local.sns_topics
  to       = aws_sns_topic.encrypted[each.key]
  id       = "arn:aws:sns:${var.region}:${var.account_id}:${each.key}"
}

resource "aws_sns_topic" "encrypted" {
  for_each          = local.sns_topics
  name              = each.key
  kms_master_key_id = aws_kms_key.sns.arn
}

locals {
  tls_only_buckets = {
    forms_files = aws_s3_bucket.forms_files.id
    sign        = aws_s3_bucket.sign_documents.id
    state       = "coss-tfstate-${var.account_id}"
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = local.tls_only_buckets
  bucket   = each.value
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = ["arn:aws:s3:::${each.value}", "arn:aws:s3:::${each.value}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- What the admin console's security page reads --------------------------------------------------

resource "aws_iam_role_policy" "task_web_security" {
  name = "security-read"
  role = aws_iam_role.task["web"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Read"
        Effect = "Allow"
        Action = [
          "artifact:ListCustomerAgreements",
          "elasticloadbalancing:DescribeTargetGroups",
          "config:DescribeConfigurationRecorderStatus",
          "guardduty:GetDetector",
          "guardduty:GetFindings",
          "guardduty:ListDetectors",
          "guardduty:ListFindings",
          "securityhub:DescribeHub",
          "securityhub:GetEnabledStandards",
          "securityhub:GetFindings",
        ]
        Resource = "*"
      },
      {
        Sid      = "AlertSubscribers"
        Effect   = "Allow"
        Action   = ["sns:ListSubscriptionsByTopic"]
        Resource = data.aws_sns_topic.alerts.arn
      },
      {
        Sid      = "TopicEncryption"
        Effect   = "Allow"
        Action   = ["sns:GetTopicAttributes"]
        Resource = [for topic in local.sns_topics : "arn:aws:sns:${var.region}:${var.account_id}:${topic}"]
      },
      {
        Sid      = "DatabaseAudit"
        Effect   = "Allow"
        Action   = ["logs:StartQuery"]
        Resource = "${aws_cloudwatch_log_group.database.arn}:*"
      },
      {
        Sid      = "DatabaseAuditResults"
        Effect   = "Allow"
        Action   = ["logs:GetQueryResults"]
        Resource = "*"
      },
      {
        Sid      = "LogDelivery"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.access_logs.arn
      },
      {
        Sid      = "ManagementAccount"
        Effect   = "Allow"
        Action   = ["sts:AssumeRole"]
        Resource = "arn:aws:iam::${var.management_account_id}:role/coss-security-read"
      },
    ]
  })
}
