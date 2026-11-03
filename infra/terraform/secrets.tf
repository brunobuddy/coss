# The stage secret: one JSON object holding every `secret` variable of spec.json. Terraform only
# creates the container; values are written with `aws secretsmanager put-secret-value` (README,
# "Deploying to AWS"), so they never reach the Terraform state.
resource "aws_secretsmanager_secret" "stage" {
  name        = "coss/${var.stage}"
  description = "coss.com ${var.stage}: every task's secret environment variables (JSON)"
}

# The origin headers are part of the ALB rules and CloudFront's configuration (and so of the
# state either way); Terraform generates them and keeps a copy here for operators.
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "tracking_origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "portal_origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "sign_origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "scheduling_origin_verify" {
  length  = 48
  special = false
}

resource "random_password" "forms_origin_verify" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "origin_verify" {
  name        = "coss/${var.stage}/origin-verify"
  description = "X-Origin-Verify: CloudFront's custom origin header, required by every ALB rule"
}

resource "aws_secretsmanager_secret_version" "origin_verify" {
  secret_id     = aws_secretsmanager_secret.origin_verify.id
  secret_string = random_password.origin_verify.result
}

resource "aws_secretsmanager_secret" "tracking_origin_verify" {
  name        = "coss/${var.stage}/tracking-origin-verify"
  description = "X-Tracking-Origin-Verify: set by Cloudflare's transform rule on custom tracking hostnames"
}

resource "aws_secretsmanager_secret_version" "tracking_origin_verify" {
  secret_id     = aws_secretsmanager_secret.tracking_origin_verify.id
  secret_string = random_password.tracking_origin_verify.result
}

resource "aws_secretsmanager_secret" "portal_origin_verify" {
  name        = "coss/${var.stage}/portal-origin-verify"
  description = "X-Portal-Origin-Verify: set by Cloudflare's transform rule on the Hooks portal's zone"
}

resource "aws_secretsmanager_secret_version" "portal_origin_verify" {
  secret_id     = aws_secretsmanager_secret.portal_origin_verify.id
  secret_string = random_password.portal_origin_verify.result
}

resource "aws_secretsmanager_secret" "sign_origin_verify" {
  name        = "coss/${var.stage}/sign-origin-verify"
  description = "X-Sign-Origin-Verify: set by Cloudflare's transform rule on Sign's zone"
}

resource "aws_secretsmanager_secret_version" "sign_origin_verify" {
  secret_id     = aws_secretsmanager_secret.sign_origin_verify.id
  secret_string = random_password.sign_origin_verify.result
}

resource "aws_secretsmanager_secret" "scheduling_origin_verify" {
  name        = "coss/${var.stage}/scheduling-origin-verify"
  description = "X-Scheduling-Origin-Verify: set by Cloudflare's transform rule on Scheduling's zone"
}

resource "aws_secretsmanager_secret_version" "scheduling_origin_verify" {
  secret_id     = aws_secretsmanager_secret.scheduling_origin_verify.id
  secret_string = random_password.scheduling_origin_verify.result
}

resource "aws_secretsmanager_secret" "forms_origin_verify" {
  name        = "coss/${var.stage}/forms-origin-verify"
  description = "X-Forms-Origin-Verify: set by Cloudflare's transform rule on Forms' zone"
}

resource "aws_secretsmanager_secret_version" "forms_origin_verify" {
  secret_id     = aws_secretsmanager_secret.forms_origin_verify.id
  secret_string = random_password.forms_origin_verify.result
}
