output "certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in the coss.com Cloudflare zone."
  value = distinct(concat(
    [for option in aws_acm_certificate.alb.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }],
    [for option in aws_acm_certificate.cloudfront.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }],
  ))
}

output "portal_certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in the Hooks portal's Cloudflare zone."
  value       = [for option in aws_acm_certificate.portal.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }]
}

output "sign_certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in Sign's Cloudflare zone."
  value       = [for option in aws_acm_certificate.sign.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }]
}

output "scheduling_certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in Scheduling's Cloudflare zone."
  value       = [for option in aws_acm_certificate.scheduling.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }]
}

output "forms_certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in Forms' Cloudflare zone."
  value       = [for option in aws_acm_certificate.forms.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }]
}

output "smtp_certificate_validation_records" {
  description = "CNAMEs to add (DNS only) in the coss.com Cloudflare zone for the SMTP relay's certificate."
  value       = [for option in aws_acm_certificate.smtp.domain_validation_options : { name = option.resource_record_name, value = option.resource_record_value }]
}

output "nlb_dns_name" {
  description = "Target of the DNS-only smtp.coss.com CNAME (Cloudflare can't proxy SMTP)."
  value       = aws_lb.smtp.dns_name
}

output "dashboard_distribution" {
  value = { id = aws_cloudfront_distribution.dashboard.id, domain = aws_cloudfront_distribution.dashboard.domain_name }
}

output "api_distribution" {
  value = { id = aws_cloudfront_distribution.api.id, domain = aws_cloudfront_distribution.api.domain_name }
}

output "alb_dns_name" {
  description = "Target of the proxied track.cosslinks.com, portal, Sign, Forms and Scheduling host records (Cloudflare)."
  value       = aws_lb.main.dns_name
}

output "private_subnet_ids" {
  value = [for subnet in aws_subnet.private : subnet.id]
}

output "task_security_group_ids" {
  value = { for name, group in aws_security_group.task : name => group.id }
}

output "valkey_security_group_id" {
  value = aws_security_group.valkey.id
}

output "db_endpoint" {
  value = aws_db_instance.main.address
}

output "stage_secret_arn" {
  value = aws_secretsmanager_secret.stage.arn
}

output "cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecr_registry" {
  value = split("/", aws_ecr_repository.service["web"].repository_url)[0]
}

output "deploy_runner_label" {
  description = "runs-on prefix of the Deploy workflow's jobs."
  value       = "codebuild-${aws_codebuild_project.deploy.name}"
}

output "github_connection_arn" {
  value = aws_codeconnections_connection.github.arn
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "bootstrap_role_arn" {
  value = aws_iam_role.bootstrap.arn
}

output "image_tag_parameter" {
  value = aws_ssm_parameter.image_tag.name
}
