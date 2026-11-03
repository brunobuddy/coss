resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_db_parameter_group" "main" {
  name   = "${local.name}-postgres18"
  family = "postgres18"
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
  # Audits schema and role changes (no parameters or reads: those can hold customer data). Takes
  # effect after a reboot, then `CREATE EXTENSION pgaudit` (infra/AGENTS.md, "Security monitoring").
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements,pg_tle,pgaudit"
    apply_method = "pending-reboot"
  }
  parameter {
    name  = "pgaudit.log"
    value = "ddl,role"
  }
  parameter {
    name  = "pgaudit.log_parameter"
    value = "0"
  }
  # Logs statements slower than 1 s (no parameters: they can hold customer data).
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

# The master password is the one in the stage secret's DATABASE_URL (what the apps use), read
# ephemerally and written write-only: it never reaches the state.
ephemeral "aws_secretsmanager_secret_version" "stage" {
  secret_id = aws_secretsmanager_secret.stage.id
}

locals {
  db_password = regex("^postgres://[^:]+:([^@]+)@", jsondecode(ephemeral.aws_secretsmanager_secret_version.stage.secret_string).DATABASE_URL)[0]
}

# Pool budget (README, "Deploying to AWS"): (web + api + worker max tasks) × DATABASE_POOL_MAX +
# api tasks + 5 × worker tasks ≈ (6 + 6 + 2) × 10 + 6 + 10 = 156, well under db.t4g.medium's ~410.
resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class
  multi_az       = true

  db_name                               = "coss"
  username                              = "coss"
  password_wo                           = local.db_password
  password_wo_version                   = var.db_password_version
  ca_cert_identifier                    = "rds-ca-rsa2048-g1"
  parameter_group_name                  = aws_db_parameter_group.main.name
  db_subnet_group_name                  = aws_db_subnet_group.main.name
  vpc_security_group_ids                = [aws_security_group.db.id]
  publicly_accessible                   = false
  allocated_storage                     = 50
  max_allocated_storage                 = 500
  storage_type                          = "gp3"
  storage_encrypted                     = true
  backup_retention_period               = 14
  backup_window                         = "07:00-08:00"
  maintenance_window                    = "sun:08:30-sun:09:30"
  copy_tags_to_snapshot                 = true
  deletion_protection                   = true
  skip_final_snapshot                   = false
  final_snapshot_identifier             = "${local.name}-final"
  auto_minor_version_upgrade            = true
  allow_major_version_upgrade           = false
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql"]
}

import {
  to = aws_cloudwatch_log_group.database
  id = "/aws/rds/instance/${local.name}/postgresql"
}

# Where pgaudit's lines land; a year, unlike the services' shorter application logs.
resource "aws_cloudwatch_log_group" "database" {
  name              = "/aws/rds/instance/${local.name}/postgresql"
  retention_in_days = 365
}
