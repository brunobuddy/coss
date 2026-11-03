# VPC over two AZs: public subnets for the ALB and NAT gateways, private subnets for tasks, RDS
# and Valkey. One NAT gateway per AZ (the worker's webhook deliveries and every app's public DNS
# checks need egress); AWS APIs go through VPC endpoints to keep that traffic off the NAT.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  for_each                = { for index, az in var.availability_zones : az => index }
  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.key
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, each.value)
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.name}-public-${each.key}" }
}

resource "aws_subnet" "private" {
  for_each          = { for index, az in var.availability_zones : az => index }
  vpc_id            = aws_vpc.main.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, each.value + 8)
  tags              = { Name = "${local.name}-private-${each.key}" }
}

# Routes are their own resources: GuardDuty adds some to every table, and inline ones would delete them.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  for_each = aws_subnet.public
  domain   = "vpc"
  tags     = { Name = "${local.name}-nat-${each.key}" }
}

resource "aws_nat_gateway" "main" {
  for_each      = aws_subnet.public
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = each.value.id
  tags          = { Name = "${local.name}-${each.key}" }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "private" {
  for_each = aws_subnet.private
  vpc_id   = aws_vpc.main.id
  tags     = { Name = "${local.name}-private-${each.key}" }
}

resource "aws_route" "private_internet" {
  for_each               = aws_subnet.private
  route_table_id         = aws_route_table.private[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[each.key].id
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}

# --- VPC endpoints ---------------------------------------------------------------------------

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [for table in aws_route_table.private : table.id]
  tags              = { Name = "${local.name}-s3" }
}

resource "aws_security_group" "endpoints" {
  name        = "${local.name}-endpoints"
  description = "Interface VPC endpoints: HTTPS from inside the VPC"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-endpoints" }
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id = aws_security_group.endpoints.id
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_endpoint" "interface" {
  # `email` is the SES API (the apps call SES v2 over HTTPS).
  for_each            = toset(["sqs", "secretsmanager", "ecr.api", "ecr.dkr", "logs", "email"])
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [for subnet in aws_subnet.private : subnet.id]
  security_group_ids  = [aws_security_group.endpoints.id]
  tags                = { Name = "${local.name}-${each.key}" }
}

# --- Security groups -------------------------------------------------------------------------

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# The CloudFront prefix list weighs ~55 rules of a group's 60, so Cloudflare gets its own group.
resource "aws_security_group" "alb_cloudfront" {
  name        = "${local.name}-alb-cloudfront"
  description = "ALB: HTTPS from CloudFront only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-alb-cloudfront" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_cloudfront" {
  security_group_id = aws_security_group.alb_cloudfront.id
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_security_group" "alb_cloudflare" {
  name        = "${local.name}-alb-cloudflare"
  description = "ALB: HTTPS from Cloudflare (custom tracking domains)"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-alb-cloudflare" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_cloudflare" {
  for_each          = toset(var.cloudflare_ipv4_ranges)
  security_group_id = aws_security_group.alb_cloudflare.id
  cidr_ipv4         = each.key
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks_tls" {
  for_each                     = local.lb_services
  security_group_id            = aws_security_group.alb_cloudfront.id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.tlsPort
  to_port                      = each.value.tlsPort
}

resource "aws_security_group" "task" {
  for_each    = local.services
  name        = "${local.name}-${each.key}"
  description = "${each.key} tasks"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-${each.key}" }
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb_tls" {
  for_each                     = local.lb_services
  security_group_id            = aws_security_group.task[each.key].id
  referenced_security_group_id = aws_security_group.alb_cloudfront.id
  ip_protocol                  = "tcp"
  from_port                    = each.value.tlsPort
  to_port                      = each.value.tlsPort
}

# Plain-TCP services (the SMTP relay) behind the NLB, which preserves client addresses: their
# container ports are open to the internet. The tasks have no public address, so only the NLB
# reaches them; abuse is limited per client address by the relay itself (smtp.connections.ip).
resource "aws_vpc_security_group_ingress_rule" "task_from_nlb" {
  for_each          = local.nlb_targets
  security_group_id = aws_security_group.task[each.value.service].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
}

# Tasks reach everything outbound: customer webhooks go to arbitrary hosts and ports, and DNS
# checks query public resolvers directly. The site needs nothing but AWS endpoints, but egress
# rules can't tell the NAT from the endpoints, so it gets the same.
resource "aws_vpc_security_group_egress_rule" "task_all" {
  for_each          = local.services
  security_group_id = aws_security_group.task[each.key].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "RDS Postgres: 5432 from web, api and worker"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db" {
  for_each                     = toset(["web", "portal", "sign", "scheduling", "api", "worker", "smtp"])
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "valkey" {
  name        = "${local.name}-valkey"
  description = "ElastiCache Serverless (Valkey): 6379 from web and api"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.name}-valkey" }
}

# The worker counts each organization's daily inbound limit (`email.inbound.day`). The group's
# description still says "web and api": changing it would replace the group.
resource "aws_vpc_security_group_ingress_rule" "valkey" {
  for_each                     = toset(["web", "portal", "sign", "api", "worker", "smtp"])
  security_group_id            = aws_security_group.valkey.id
  referenced_security_group_id = aws_security_group.task[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}
