# The AWS Organization's management account: what must survive a compromised production account.
# Applied by hand with management credentials (infra/AGENTS.md), never by CI.

locals {
  region                = "us-east-2"
  management_account_id = "456651119109"
  production_account_id = "294417174674"
  trail_name            = "coss-organization"
  trail_arn             = "arn:aws:cloudtrail:${local.region}:${local.management_account_id}:trail/${local.trail_name}"
  production_web_role   = "arn:aws:iam::${local.production_account_id}:role/coss-production-web"
  production_event_bus  = "arn:aws:events:${local.region}:${local.production_account_id}:event-bus/default"

  # Object-level reads and writes of the buckets that can hold customers' documents.
  sensitive_buckets = [
    "coss-inbound-${local.production_account_id}",
    "coss-production-forms-files-${local.production_account_id}",
    "coss-production-sign-documents-${local.production_account_id}",
  ]
}

import {
  to = aws_organizations_organization.main
  id = "o-5rvroviykw"
}

# The first eight are AWS's own, from advanced features: the list is the whole list, so dropping
# one would turn that service's access off.
resource "aws_organizations_organization" "main" {
  feature_set          = "ALL"
  enabled_policy_types = ["RESOURCE_CONTROL_POLICY", "SERVICE_CONTROL_POLICY"]
  aws_service_access_principals = [
    "account-access.amazonaws.com",
    "account.amazonaws.com",
    "aws-artifact-account-sync.amazonaws.com",
    "compute-optimizer.amazonaws.com",
    "cost-optimization-hub.bcm.amazonaws.com",
    "iam.amazonaws.com",
    "notifications.amazonaws.com",
    "sso.amazonaws.com",
    "access-analyzer.amazonaws.com",
    "cloudtrail.amazonaws.com",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

# --- Audit trail -------------------------------------------------------------------------------

resource "aws_kms_key" "audit" {
  description             = "coss: organization audit trail"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Account"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.management_account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudTrailEncrypt"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:GenerateDataKey*"
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${local.management_account_id}:trail/*"
          }
        }
      },
      {
        Sid       = "CloudTrailDescribe"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "audit" {
  name          = "alias/coss-organization-audit"
  target_key_id = aws_kms_key.audit.key_id
}

# Six years, HIPAA's documentation period, under Object Lock. Governance mode, not compliance: this
# account's administrators can still remove a mistake with an explicit bypass, nobody else can.
resource "aws_s3_bucket" "audit" {
  bucket              = "coss-organization-audit-${local.management_account_id}"
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.audit.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "audit" {
  depends_on = [aws_s3_bucket_versioning.audit]
  bucket     = aws_s3_bucket.audit.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = 2192
    }
  }
}

resource "aws_s3_bucket_public_access_block" "audit" {
  bucket                  = aws_s3_bucket.audit.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit" {
  bucket = aws_s3_bucket.audit.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.audit.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "audit" {
  depends_on = [aws_s3_bucket_versioning.audit]
  bucket     = aws_s3_bucket.audit.id
  rule {
    id     = "archive-then-expire"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }
    expiration {
      days = 2200
    }
    noncurrent_version_expiration {
      noncurrent_days = 2200
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "audit" {
  depends_on = [aws_s3_bucket_public_access_block.audit]
  bucket     = aws_s3_bucket.audit.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.audit.arn, "${aws_s3_bucket.audit.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "CloudTrailCheckBucket"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.audit.arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource = [
          "${aws_s3_bucket.audit.arn}/AWSLogs/${local.management_account_id}/*",
          "${aws_s3_bucket.audit.arn}/AWSLogs/${aws_organizations_organization.main.id}/*",
        ]
        Condition = {
          StringEquals = {
            "aws:SourceArn" = local.trail_arn
            "s3:x-amz-acl"  = "bucket-owner-full-control"
          }
        }
      },
    ]
  })
}

resource "aws_cloudtrail" "organization" {
  depends_on                    = [aws_s3_bucket_policy.audit, aws_organizations_organization.main]
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.audit.id
  kms_key_id                    = aws_kms_key.audit.arn
  is_organization_trail         = true
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  advanced_event_selector {
    name = "Every management event"
    field_selector {
      field  = "eventCategory"
      equals = ["Management"]
    }
  }

  advanced_event_selector {
    name = "Objects in the buckets holding customers' documents"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field       = "resources.ARN"
      starts_with = [for bucket in local.sensitive_buckets : "arn:aws:s3:::${bucket}/"]
    }
  }
}

# Created by hand before anything else existed; only its policy is managed here.
resource "aws_s3_bucket_policy" "state" {
  bucket = "coss-org-tfstate-${local.management_account_id}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        "arn:aws:s3:::coss-org-tfstate-${local.management_account_id}",
        "arn:aws:s3:::coss-org-tfstate-${local.management_account_id}/*",
      ]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- Detection ---------------------------------------------------------------------------------

resource "aws_guardduty_detector" "management" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_guardduty_detector_feature" "management" {
  for_each = {
    S3_DATA_EVENTS         = "ENABLED"
    RDS_LOGIN_EVENTS       = "DISABLED"
    EBS_MALWARE_PROTECTION = "DISABLED"
    LAMBDA_NETWORK_LOGS    = "DISABLED"
    EKS_AUDIT_LOGS         = "DISABLED"
  }
  detector_id = aws_guardduty_detector.management.id
  name        = each.key
  status      = each.value
}

resource "aws_accessanalyzer_analyzer" "organization" {
  depends_on    = [aws_organizations_organization.main]
  analyzer_name = "coss-organization"
  type          = "ORGANIZATION"
}

# --- Protection from production's own administrators ---------------------------------------------

resource "aws_organizations_policy" "protect_monitoring" {
  name        = "ProtectSecurityMonitoring"
  description = "Production can't switch off its threat detection or configuration recording."
  type        = "SERVICE_CONTROL_POLICY"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "KeepMonitoringOn"
      Effect = "Deny"
      Action = [
        "guardduty:DeleteDetector",
        "guardduty:UpdateDetector",
        "guardduty:DisassociateFromAdministratorAccount",
        "securityhub:DisableSecurityHub",
        "config:DeleteConfigurationRecorder",
        "config:DeleteDeliveryChannel",
        "config:StopConfigurationRecorder",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_organizations_policy_attachment" "protect_monitoring" {
  policy_id = aws_organizations_policy.protect_monitoring.id
  target_id = local.production_account_id
}

# --- The admin console's view ------------------------------------------------------------------

resource "aws_iam_role" "security_read" {
  name = "coss-security-read"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = local.production_web_role }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "security_read" {
  name = "status-only"
  role = aws_iam_role.security_read.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "access-analyzer:ListAnalyzers",
        "access-analyzer:ListFindings",
        "cloudtrail:DescribeTrails",
        "cloudtrail:GetTrailStatus",
        "cloudtrail:LookupEvents",
        "guardduty:GetDetector",
        "guardduty:GetFindings",
        "guardduty:ListDetectors",
        "guardduty:ListFindings",
        "iam:GetAccountSummary",
      ]
      Resource = "*"
    }]
  })
}

# --- Alerts: forwarded to production's bus, which emails coss-alerts (infra/terraform/security.tf) -

resource "aws_iam_role" "forward_events" {
  name = "coss-forward-security-events"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "forward_events" {
  name = "put-events"
  role = aws_iam_role.forward_events.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "events:PutEvents"
      Resource = local.production_event_bus
    }]
  })
}

locals {
  root_activity = {
    "detail-type" = ["AWS Console Sign In via CloudTrail", "AWS API Call via CloudTrail"]
    detail        = { userIdentity = { type = ["Root"] } }
  }
  forwarded_events = {
    threat = {
      source        = ["aws.guardduty"]
      "detail-type" = ["GuardDuty Finding"]
      detail        = { severity = [{ numeric = [">=", 7] }] }
    }
    root = local.root_activity
    audit-trail = {
      source        = ["aws.cloudtrail"]
      "detail-type" = ["AWS API Call via CloudTrail"]
      detail        = { eventName = ["StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors"] }
    }
    outside-access = {
      source        = ["aws.access-analyzer"]
      "detail-type" = ["Access Analyzer Finding"]
      detail        = { status = ["ACTIVE"] }
    }
  }
}

resource "aws_cloudwatch_event_rule" "forward" {
  for_each      = local.forwarded_events
  name          = "coss-forward-${each.key}"
  event_pattern = jsonencode(each.value)
}

resource "aws_cloudwatch_event_target" "forward" {
  for_each = local.forwarded_events
  rule     = aws_cloudwatch_event_rule.forward[each.key].name
  arn      = local.production_event_bus
  role_arn = aws_iam_role.forward_events.arn
}

resource "aws_cloudwatch_event_rule" "forward_root_us_east_1" {
  provider      = aws.us_east_1
  name          = "coss-forward-root"
  event_pattern = jsonencode(local.root_activity)
}

resource "aws_cloudwatch_event_target" "forward_root_us_east_1" {
  provider = aws.us_east_1
  rule     = aws_cloudwatch_event_rule.forward_root_us_east_1.name
  arn      = local.production_event_bus
  role_arn = aws_iam_role.forward_events.arn
}
