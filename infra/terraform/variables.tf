variable "account_id" {
  type        = string
  description = "The stage's AWS account (one account per stage: SES identities are account-wide)."
}

variable "region" {
  type = string
}

variable "stage" {
  type        = string
  description = "Names resources (`coss-<stage>-…` where it matters) and the stage secret `coss/<stage>`."
}

variable "availability_zones" {
  type = list(string)
}

variable "vpc_cidr" {
  type = string
}

variable "dashboard_host" {
  type        = string
  description = "coss.com: the dashboard and site zones (DASHBOARD_HOST in infra/aws/routing.ts)."
}

variable "api_host" {
  type        = string
  description = "api.coss.com (API_HOST in infra/aws/routing.ts)."
}

variable "deploy_actor_ids" {
  type        = list(string)
  description = "Numeric GitHub user ids allowed to start the deploy runner (`gh api users/<login> --jq .id`)."
}

variable "smtp_host" {
  type        = string
  description = "The SMTP relay's host (smtp.coss.com): a DNS-only Cloudflare record to the NLB."
}

variable "portal_host" {
  type        = string
  description = "The Hooks portal's host (PORTAL_HOST in infra/aws/routing.ts)."
}

variable "sign_host" {
  type        = string
  description = "Sign's signing app's host (SIGN_HOST in infra/aws/routing.ts)."
}

variable "forms_host" {
  type        = string
  description = "Forms' host, the api's `/f/*` (FORMS_HOST in infra/aws/routing.ts)."
}

variable "scheduling_host" {
  type        = string
  description = "Scheduling's hosted pages' host (SCHEDULING_HOST in infra/aws/routing.ts)."
}

variable "external_origin_hosts" {
  type        = map(string)
  description = "Production hostname of each external zone (spec.json cloudFront.origins other than alb): the coss ui and qnot repositories' Vercel projects."
}

variable "ses_name" {
  type        = string
  description = "The `--name` given to ses:bootstrap: its IAM policies are /coss/<name>-{api,dashboard,worker}."
}

variable "initial_image_tag" {
  type        = string
  description = "Image tag of the first task definitions; afterwards the deploy workflow owns the tag (SSM)."
}

variable "plain_env" {
  type        = map(map(string))
  description = "Plain environment values per service. Names and kinds come from spec.json; a required plain variable without a value fails the plan."
}

variable "unset_secrets" {
  type        = set(string)
  default     = []
  description = "Optional secret variables with no key in the stage secret yet: left out of task definitions (ECS can't start a task whose secret names a missing key). Remove a name after put-secret.sh stores it."
}

variable "autoscaling" {
  type = map(object({ max = number, cpu_target = number }))
}

variable "db_instance_class" {
  type = string
}

variable "db_engine_version" {
  type = string
}

variable "db_password_version" {
  type        = number
  description = "Bump after changing the password in the stage secret's DATABASE_URL to apply it to RDS."
}

variable "cloudflare_ipv4_ranges" {
  type        = list(string)
  description = "https://www.cloudflare.com/ips-v4: Cloudflare for SaaS reaches the ALB from these (tracking domains)."
}

variable "waf_rate_limits" {
  type        = object({ dashboard = number, api = number })
  description = "Requests per IP per 5 minutes before WAF blocks (flood protection; the apps rate-limit precisely)."
}

variable "log_retention_days" {
  type = number
}

variable "github_repository" {
  type        = string
  description = "owner/name of the repository whose `production` environment may deploy."
}

variable "alert_email" {
  type        = string
  description = "Receives alarms, budget alerts and cost anomalies."
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly AWS spend that triggers budget alerts (80% actual, 100% forecasted)."
}
