<?php

namespace Coss\Types;

enum RiskAssessmentDegradedItem: string
{
    case EmailDns = "email_dns";
    case DomainAge = "domain_age";
    case IpData = "ip_data";
    case Velocity = "velocity";
    case Captcha = "captcha";
    case Content = "content";
    case IpPrivacy = "ip_privacy";
    case UsageLimit = "usage_limit";
}
