# Support: the bucket of ticket attachments, SUPPORT_FILES_BUCKET (plain_env: web and worker); see
# packages/support/AGENTS.md.

resource "aws_kms_key" "support_files" {
  description             = "${local.name}: Support files bucket"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "support_files" {
  name          = "alias/${local.name}-support-files"
  target_key_id = aws_kms_key.support_files.key_id
}

# Files strangers can email us: never public, never versioned (a deleted file is gone). No expiry
# rule: a ticket keeps its files until two years after it's resolved, however long it stays open,
# so the worker's purge deletes them with the ticket.
resource "aws_s3_bucket" "support_files" {
  bucket = "${local.name}-support-files-${var.account_id}"
}

resource "aws_s3_bucket_ownership_controls" "support_files" {
  bucket = aws_s3_bucket.support_files.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "support_files" {
  bucket                  = aws_s3_bucket.support_files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "support_files" {
  bucket = aws_s3_bucket.support_files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.support_files.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "support_files" {
  bucket = aws_s3_bucket.support_files.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

locals {
  support_files_statements = [
    {
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      Resource = ["${aws_s3_bucket.support_files.arn}/*"]
    },
    {
      Effect   = "Allow"
      Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
      Resource = [aws_kms_key.support_files.arn]
    },
  ]
}

# The dashboard stores uploads and serves downloads; the worker copies received attachments in,
# reads them to send, and deletes them with their tickets.
resource "aws_iam_role_policy" "task_support_files" {
  for_each = toset(["web", "worker"])
  name     = "support-files"
  role     = aws_iam_role.task[each.key].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.support_files_statements
  })
}

output "support_files_bucket" {
  description = "SUPPORT_FILES_BUCKET (web and worker)."
  value       = aws_s3_bucket.support_files.bucket
}
