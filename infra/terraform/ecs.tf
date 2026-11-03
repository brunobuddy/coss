resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/coss/${var.stage}/${each.key}"
  retention_in_days = var.log_retention_days
}

locals {
  # Every service's environment, from spec.json: `plain` values from var.plain_env, `secret` ones
  # from the stage secret's JSON key of the same name (optional ones listed in var.unset_secrets
  # left out: ECS can't start a task whose secret names a missing key), `image` ones left to the
  # Dockerfile.
  # Plain values Terraform owns (ARNs of resources it creates), merged over var.plain_env.
  generated_env = {
    smtp = { SMTP_TLS_CERTIFICATE_ARN = aws_acm_certificate_validation.smtp.certificate_arn }
  }
  plain_values = {
    for name, service in local.services : name => merge(lookup(var.plain_env, name, {}), lookup(local.generated_env, name, {}))
  }

  env = {
    for name, service in local.services : name => {
      plain = [
        for variable in service.env : { name = variable.name, value = local.plain_values[name][variable.name] }
        if variable.kind == "plain" && contains(keys(local.plain_values[name]), variable.name)
      ]
      secrets = [
        for variable in service.env : {
          name      = variable.name
          valueFrom = "${aws_secretsmanager_secret.stage.arn}:${variable.name}::"
        }
        if variable.kind == "secret" && !contains(var.unset_secrets, variable.name)
      ]
      missing = [
        for variable in service.env : variable.name
        if variable.kind == "plain" && variable.required && !contains(keys(local.plain_values[name]), variable.name)
      ]
      unset_required = [
        for variable in service.env : variable.name
        if variable.kind == "secret" && variable.required && contains(var.unset_secrets, variable.name)
      ]
      undeclared = [
        for key in keys(lookup(var.plain_env, name, {})) : key
        if !contains([for variable in service.env : variable.name if variable.kind == "plain"], key)
      ]
    }
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name        = each.key
    image       = "${aws_ecr_repository.service[each.key].repository_url}:${aws_ssm_parameter.image_tag.insecure_value}"
    essential   = true
    stopTimeout = each.value.stopTimeout
    environment = local.env[each.key].plain
    secrets     = local.env[each.key].secrets
    portMappings = [
      for port in distinct(concat(
        try(each.value.port, null) == null ? [] : [each.value.port],
        try(each.value.tlsPort, null) == null ? [] : [each.value.tlsPort],
        [for mapping in try(each.value.tcpPorts, []) : mapping.container],
      )) : { containerPort = port, protocol = "tcp" }
    ]
    # Reaps zombie processes and lets ECS Exec start its agent.
    linuxParameters = { initProcessEnabled = true }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = each.key
      }
    }
  }])

  lifecycle {
    precondition {
      condition     = length(local.env[each.key].missing) == 0
      error_message = "${each.key}: required plain variables without a value in plain_env: ${join(", ", local.env[each.key].missing)}"
    }
    precondition {
      condition     = length(local.env[each.key].undeclared) == 0
      error_message = "${each.key}: plain_env sets variables spec.json doesn't declare as plain: ${join(", ", local.env[each.key].undeclared)}"
    }
    precondition {
      condition     = length(local.env[each.key].unset_required) == 0
      error_message = "${each.key}: unset_secrets lists required secrets: ${join(", ", local.env[each.key].unset_required)}"
    }
  }
}

resource "aws_ecs_service" "service" {
  for_each               = local.services
  name                   = each.key
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.service[each.key].arn
  desired_count          = each.value.minTasks
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = true
  propagate_tags         = "SERVICE"

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  health_check_grace_period_seconds = contains(keys(local.lb_services), each.key) || contains(keys(local.nlb_services), each.key) ? 60 : null

  network_configuration {
    subnets          = [for subnet in aws_subnet.private : subnet.id]
    security_groups  = [aws_security_group.task[each.key].id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = contains(keys(local.lb_services), each.key) ? [each.value.tlsPort] : []
    content {
      target_group_arn = aws_lb_target_group.tls[each.key].arn
      container_name   = each.key
      container_port   = load_balancer.value
    }
  }

  dynamic "load_balancer" {
    for_each = { for key, target in local.nlb_targets : key => target if target.service == each.key }
    content {
      target_group_arn = aws_lb_target_group.tcp[load_balancer.key].arn
      container_name   = each.key
      container_port   = load_balancer.value.port
    }
  }

  # The deploy workflow registers new revisions (new images) and autoscaling moves the count.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.https, aws_lb_listener.tcp]
}

resource "aws_appautoscaling_target" "service" {
  for_each           = local.services
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.service[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = each.value.minTasks
  max_capacity       = var.autoscaling[each.key].max
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each           = aws_appautoscaling_target.service
  name               = "${local.name}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = each.value.service_namespace
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.autoscaling[each.key].cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
