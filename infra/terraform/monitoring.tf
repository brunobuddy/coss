# Alarms and cost guardrails. Alarms notify `<ses_name>-alerts` (created by ses:bootstrap with
# --alert-email, already confirmed). Application errors, worker loops (cron monitors `worker-<loop>`)
# and uptime (multi-region probes, README "Monitoring") are Sentry's: the organization's SCP denies
# us-east-1, the only region with Route 53 health check and CloudFront metrics.

data "aws_sns_topic" "alerts" {
  name = "${var.ses_name}-alerts"
}

locals {
  alarm_actions = [data.aws_sns_topic.alerts.arn]
}

# --- ECS ---------------------------------------------------------------------------------------

# Fewer running tasks than the service's minimum for 5 minutes: crash loops, failed pulls,
# capacity limits (Fargate vCPU quota). Container Insights metric.
resource "aws_cloudwatch_metric_alarm" "ecs_running_tasks" {
  for_each            = local.services
  alarm_name          = "${local.name}-${each.key}-running-tasks"
  alarm_description   = "${each.key}: fewer than ${each.value.minTasks} running tasks"
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = each.key }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 5
  comparison_operator = "LessThanThreshold"
  threshold           = each.value.minTasks
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# Memory doesn't autoscale (CPU does): a task near its limit gets OOM-killed.
resource "aws_cloudwatch_metric_alarm" "ecs_memory" {
  for_each            = local.services
  alarm_name          = "${local.name}-${each.key}-memory"
  alarm_description   = "${each.key}: average memory above 85% of the task size for 15 minutes"
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = each.key }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# CPU at the autoscaling ceiling: scaling out can't help any more.
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_at_max" {
  for_each            = local.services
  alarm_name          = "${local.name}-${each.key}-cpu-saturated"
  alarm_description   = "${each.key}: average CPU above 90% for 15 minutes (autoscaling max ${var.autoscaling[each.key].max})"
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = each.key }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 90
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- Load balancer ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "The load balancer itself answered 5xx (no healthy target, timeouts) more than 10 times in 5 minutes"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each            = local.lb_services
  alarm_name          = "${local.name}-${each.key}-5xx"
  alarm_description   = "${each.key} answered 5xx more than 25 times in 5 minutes"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.tls[each.key].arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 25
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_targets" {
  for_each            = local.lb_services
  alarm_name          = "${local.name}-${each.key}-unhealthy-targets"
  alarm_description   = "${each.key}: a target has failed its health check for 5 minutes"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.main.arn_suffix, TargetGroup = aws_lb_target_group.tls[each.key].arn_suffix }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# The SMTP relay has no ALB target, so none of the above sees it. Fewer healthy tasks than one on a
# port means smtp.coss.com refuses connections there.
resource "aws_cloudwatch_metric_alarm" "smtp_healthy_hosts" {
  for_each            = local.nlb_targets
  alarm_name          = "${local.name}-${each.key}-healthy-hosts"
  alarm_description   = "${each.key}: no healthy task behind the network load balancer for 3 minutes"
  namespace           = "AWS/NetworkELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.smtp.arn_suffix, TargetGroup = aws_lb_target_group.tcp[each.key].arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- SES -------------------------------------------------------------------------------------

# The account's reputation, as AWS measures it. SES reviews an account at a 5 % bounce or 0.1 %
# complaint rate and can pause all sending at 10 % or 0.5 %: every customer shares this account, so
# these warn first. SES publishes them irregularly, so no data says nothing.
locals {
  ses_reputation_alarms = {
    bounce-rate    = { metric = "Reputation.BounceRate", threshold = 0.04, description = "SES bounce rate above 4 % (AWS reviews the account at 5 %)" }
    complaint-rate = { metric = "Reputation.ComplaintRate", threshold = 0.0008, description = "SES complaint rate above 0.08 % (AWS reviews the account at 0.1 %)" }
  }
}

resource "aws_cloudwatch_metric_alarm" "ses_reputation" {
  for_each            = local.ses_reputation_alarms
  alarm_name          = "${local.name}-ses-${each.key}"
  alarm_description   = each.value.description
  namespace           = "AWS/SES"
  metric_name         = each.value.metric
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = each.value.threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- RDS -------------------------------------------------------------------------------------

locals {
  rds_alarms = {
    cpu = {
      metric      = "CPUUtilization", statistic = "Average", operator = "GreaterThanThreshold", threshold = 80
      description = "Database CPU above 80% for 15 minutes"
    }
    # t4g instances throttle to their baseline when credits run out.
    cpu-credits = {
      metric      = "CPUCreditBalance", statistic = "Minimum", operator = "LessThanThreshold", threshold = 30
      description = "Database CPU credits nearly exhausted (it will throttle to baseline): resize off db.t4g"
    }
    storage = {
      metric      = "FreeStorageSpace", statistic = "Minimum", operator = "LessThanThreshold", threshold = 10 * 1024 * 1024 * 1024
      description = "Less than 10 GiB of database storage free (autoscaling may have hit max_allocated_storage)"
    }
    memory = {
      metric      = "FreeableMemory", statistic = "Minimum", operator = "LessThanThreshold", threshold = 256 * 1024 * 1024
      description = "Less than 256 MiB of database memory free"
    }
    # README pool budget: ~160 at max scale, ~410 available on db.t4g.medium.
    connections = {
      metric      = "DatabaseConnections", statistic = "Maximum", operator = "GreaterThanThreshold", threshold = 300
      description = "More than 300 database connections (max_connections is ~410): lower DATABASE_POOL_MAX or add RDS Proxy"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "rds" {
  for_each            = local.rds_alarms
  alarm_name          = "${local.name}-db-${each.key}"
  alarm_description   = each.value.description
  namespace           = "AWS/RDS"
  metric_name         = each.value.metric
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = each.value.statistic
  period              = 300
  evaluation_periods  = 3
  comparison_operator = each.value.operator
  threshold           = each.value.threshold
  treat_missing_data  = "breaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- Valkey (created by valkey:bootstrap) ----------------------------------------------------

# Throttled commands mean the serverless cache hit its ECPU limit (--max-ecpu): rate limit checks
# then apply their outage policy, and auth buckets deny.
resource "aws_cloudwatch_metric_alarm" "valkey_throttled" {
  alarm_name          = "${local.name}-valkey-throttled"
  alarm_description   = "Valkey is throttling commands (ECPU limit): raise valkey:bootstrap --max-ecpu"
  namespace           = "AWS/ElastiCache"
  metric_name         = "ThrottledCmds"
  dimensions          = { clusterId = "${var.ses_name}-ratelimit" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# --- Cost ------------------------------------------------------------------------------------

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# SES alone: received mail costs us by size before anything of ours can refuse it, and spam, viruses
# and unroutable mail bill no one (README, "Abusive inbound mail").
resource "aws_budgets_budget" "ses" {
  name         = "${local.name}-ses-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.ses_monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Service"
    values = ["Amazon Simple Email Service"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# Spend spikes per service (e.g. NAT data processing, a runaway task count), daily.
resource "aws_ce_anomaly_monitor" "services" {
  name              = "${local.name}-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "services" {
  name             = "${local.name}-cost-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services.arn]

  subscriber {
    type    = "EMAIL"
    address = var.alert_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["25"]
    }
  }
}
