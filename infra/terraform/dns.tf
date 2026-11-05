# Zones whose registrars can already point at Route 53. Records that aren't in Terraform's other
# resources (DKIM, mail, ownership checks) are in dns-records.json, public DNS data by nature.
locals {
  dns_records = {
    for record in flatten([
      for zone, records in jsondecode(file("${path.module}/dns-records.json")) : [
        for key, record in records : merge(record, { zone = zone, key = "${zone} ${key}" })
      ]
    ]) : record.key => record
  }
  dns_aliases = {
    "coss.com"          = { zone = "coss.com", target = aws_cloudfront_distribution.dashboard }
    "api.coss.com"      = { zone = "coss.com", target = aws_cloudfront_distribution.api }
    "www.coss.com"      = { zone = "coss.com", target = aws_cloudfront_distribution.redirects }
    "ui.coss.com"       = { zone = "coss.com", target = aws_cloudfront_distribution.redirects }
    "mail.coss.com"     = { zone = "coss.com", target = aws_cloudfront_distribution.redirects }
    "calendar.coss.com" = { zone = "coss.com", target = aws_cloudfront_distribution.redirects }
    "drive.coss.com"    = { zone = "coss.com", target = aws_cloudfront_distribution.redirects }
    "cosssign.com"      = { zone = "cosssign.com", target = aws_cloudfront_distribution.hosted["sign"] }
    "www.cosssign.com"  = { zone = "cosssign.com", target = aws_cloudfront_distribution.redirects }
  }
  dns_alias_records = merge([
    for host, alias in local.dns_aliases : {
      for type in ["A", "AAAA"] : "${host} ${type}" => merge(alias, { host = host, type = type })
    }
  ]...)
}

resource "aws_route53_zone" "main" {
  for_each = toset(["coss.com", "cosssign.com"])
  name     = each.key
}

resource "aws_route53_record" "listed" {
  for_each = local.dns_records
  zone_id  = aws_route53_zone.main[each.value.zone].zone_id
  name     = each.value.name == "" ? each.value.zone : "${each.value.name}.${each.value.zone}"
  type     = each.value.type
  ttl      = each.value.ttl
  records  = each.value.records
}

resource "aws_route53_record" "alias" {
  for_each = local.dns_alias_records
  zone_id  = aws_route53_zone.main[each.value.zone].zone_id
  name     = each.value.host
  type     = each.value.type
  alias {
    name                   = each.value.target.domain_name
    zone_id                = each.value.target.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "smtp" {
  zone_id = aws_route53_zone.main["coss.com"].zone_id
  name    = var.smtp_host
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.smtp.dns_name]
}

output "route53_name_servers" {
  description = "What each zone's registrar must point at."
  value       = { for zone, resource in aws_route53_zone.main : zone => resource.name_servers }
}
