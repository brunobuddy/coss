# Production (coss.com). No secrets here: secret variables live in the `coss/production` Secrets
# Manager secret, the database password is read from the stage secret (DATABASE_URL).

account_id         = "294417174674"
region             = "us-east-2"
stage              = "production"
availability_zones = ["us-east-2a", "us-east-2b"]
vpc_cidr           = "10.40.0.0/16"
dashboard_host     = "coss.com"
api_host           = "api.coss.com"
portal_host        = "portal.cosshooks.com"
sign_host          = "cosssign.com"
forms_host         = "cossforms.com"
scheduling_host    = "cossbook.com"
smtp_host          = "smtp.coss.com"
external_origin_hosts = {
  ui     = "coss-com-ui.vercel.app"
  origin = "coss-com-origin.vercel.app"
  qnot   = "coss-com-qnot.vercel.app"
}
ses_name          = "coss"
github_repository = "cosscom/coss"
# Who may start the deploy runner (people with write access): keithwillcode, PeerRich, pumfleet,
# sean-brydon; coss-com-deploy[bot], the coss.com Deploy GitHub App that the admin console deploys with
# (README, "Deploying from the admin console"); and github-merge-queue[bot], which makes every push to main
# (merges land only through the merge queue). Add a new maintainer here before their dispatches can deploy.
deploy_actor_ids = ["2538462", "8019099", "25907159", "55134778", "343308169", "118344674"]
# Optional secrets not stored in coss/production: take a name out once put-secret.sh has set it.
unset_secrets = [
  "IPINFO_PRIVACY_TOKEN",
  # Sign's CSC sealer (SSL.com eSigner): until its account exists.
  "SIGN_CSC_CLIENT_SECRET", "SIGN_CSC_PASSWORD", "SIGN_CSC_TOTP_SECRET",
]
initial_image_tag  = "2a8195a759b0f11d430f3e9cebfcf535a99dbca7"
log_retention_days = 30

alert_email        = "bailey@coss.com"
monthly_budget_usd = 600

db_instance_class   = "db.t4g.medium"
db_engine_version   = "18.6"
db_password_version = 1

autoscaling = {
  web        = { max = 6, cpu_target = 60 }
  site       = { max = 4, cpu_target = 60 }
  portal     = { max = 4, cpu_target = 60 }
  sign       = { max = 4, cpu_target = 60 }
  scheduling = { max = 4, cpu_target = 60 }
  api        = { max = 6, cpu_target = 60 }
  worker     = { max = 2, cpu_target = 70 }
  smtp       = { max = 4, cpu_target = 60 }
}

waf_rate_limits = { dashboard = 5000, api = 20000 }

cloudflare_ipv4_ranges = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
]

plain_env = {
  web = {
    BETTER_AUTH_URL       = "https://coss.com"
    API_PUBLIC_URL        = "https://api.coss.com"
    SMTP_PUBLIC_HOST      = "smtp.coss.com"
    TRUSTED_PROXY_HOPS    = "2"
    TURNSTILE_SITE_KEY    = "0x4AAAAAAFU8QY0DX4ZJGoSK"
    PORTAL_PUBLIC_URL     = "https://portal.cosshooks.com"
    SIGN_PUBLIC_URL       = "https://cosssign.com"
    SCHEDULING_PUBLIC_URL = "https://cossbook.com"
    # Forms (`/f/*` on its own domain, routed to the api) and its uploads bucket.
    FORMS_PUBLIC_URL         = "https://cossforms.com"
    FORMS_FILES_BUCKET       = "coss-production-forms-files-294417174674"
    GOOGLE_CLIENT_ID         = "204721091156-k33omqkstijuaari06eidtlefif81p9m.apps.googleusercontent.com"
    GITHUB_CLIENT_ID         = "Ov23liYEf7MwkA26M9Ul"
    DEPLOY_GITHUB_APP_ID     = "5340076"
    DOMAIN_CONNECT_KEY_ID    = "_dck1"
    EMAIL_PROVIDER           = "ses"
    AWS_REGION               = "us-east-2"
    SES_CONFIGURATION_SET    = "coss"
    SES_TENANT_PREFIX        = "coss"
    INBOUND_MANAGED_DOMAIN   = "inbound.coss.com"
    SES_INBOUND_BUCKET       = "coss-inbound-294417174674"
    TRACKING_DOMAIN_PROVIDER = "cloudflare"
    CLOUDFLARE_ZONE_ID       = "2e3adbb52b68d57dfa5d71a0b7cfa3cc"
    TRACKING_CNAME_TARGET    = "track.cosslinks.com"
    DATABASE_POOL_MAX        = "10"
    VALKEY_CLUSTER           = "true"
    RATE_LIMIT_KEY_PREFIX    = "coss"
    CLIENT_IP_HEADER         = "x-forwarded-for"
    TRUSTED_PROXY_COUNT      = "2"
    BILLING_PROVIDER         = "stripe"
    # Screens live hosted form pages published here, like the api (AI_GATEWAY_API_KEY is in the
    # secret).
    RISK_CLASSIFIER = "ai"
    SCREENING_MODEL = "typesafe-ai/jev"
    # SMS through Cal.com's Twilio account (the ISV): one subaccount per organization, US brands
    # under its primary customer profile (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are in the secret).
    SMS_PROVIDER                        = "twilio"
    TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = "BU8b3b683546dc96738212fe3925d344be"
    SMS_SUBACCOUNT_PREFIX               = "coss-production"
    # coss.com's own organization (`coss`, project `notifications`, live): never suspended by admins.
    NOTIFICATIONS_ENVIRONMENT_ID = "env_01m4s0af5zent8fzxwmtkergw5"
    # coss.com Risk assesses coss.com's own sign-ups in that same environment (dogfooding).
    RISK_SIGNUP_ENVIRONMENT_ID = "env_01m4s0af5zent8fzxwmtkergw5"
    SENTRY_DSN                 = "https://4ff9a884d5223a8df7cb0a12b373cee5@o4512237982711808.ingest.de.sentry.io/4512245153333328"
    SENTRY_ENVIRONMENT         = "production"
    SENTRY_TRACES_SAMPLE_RATE  = "0.1"
  }
  site = {}
  portal = {
    DATABASE_POOL_MAX         = "5"
    VALKEY_CLUSTER            = "true"
    RATE_LIMIT_KEY_PREFIX     = "coss"
    CLIENT_IP_HEADER          = "x-forwarded-for"
    TRUSTED_PROXY_COUNT       = "2"
    SENTRY_DSN                = "https://78ffa7bb2114cbbb0d319651b055388e@o4512237982711808.ingest.de.sentry.io/4512256724238416"
    SENTRY_ENVIRONMENT        = "production"
    SENTRY_TRACES_SAMPLE_RATE = "0.1"
  }
  scheduling = {
    DATABASE_POOL_MAX         = "5"
    API_PUBLIC_URL            = "https://api.coss.com"
    SENTRY_DSN                = "https://5ec65d2d11dbe023040d38909af656b7@o4512237982711808.ingest.de.sentry.io/4512364862242896"
    SENTRY_ENVIRONMENT        = "production"
    SENTRY_TRACES_SAMPLE_RATE = "0.1"
  }
  sign = {
    DATABASE_POOL_MAX         = "5"
    AWS_REGION                = "us-east-2"
    VALKEY_CLUSTER            = "true"
    RATE_LIMIT_KEY_PREFIX     = "coss"
    CLIENT_IP_HEADER          = "x-forwarded-for"
    TRUSTED_PROXY_COUNT       = "2"
    SENTRY_DSN                = "https://30de17f59463cdd79a213f162e0101c6@o4512237982711808.ingest.de.sentry.io/4512341461631056"
    SENTRY_ENVIRONMENT        = "production"
    SENTRY_TRACES_SAMPLE_RATE = "0.1"
  }
  api = {
    BETTER_AUTH_URL              = "https://coss.com"
    API_PUBLIC_URL               = "https://api.coss.com"
    TRACKING_PUBLIC_URL          = "https://track.cosslinks.com"
    PORTAL_PUBLIC_URL            = "https://portal.cosshooks.com"
    SIGN_PUBLIC_URL              = "https://cosssign.com"
    SCHEDULING_PUBLIC_URL        = "https://cossbook.com"
    GOOGLE_CALENDAR_CLIENT_ID    = "776019028945-dnuug57hi1tsjfdbu93evm8ggp1ge00q.apps.googleusercontent.com"
    MICROSOFT_CALENDAR_CLIENT_ID = "e58a0c0d-e1bb-4aef-a861-43c755d96761"
    # Forms (`/f/*` on its own domain, routed to the api) and its uploads bucket.
    FORMS_PUBLIC_URL   = "https://cossforms.com"
    FORMS_FILES_BUCKET = "coss-production-forms-files-294417174674"
    API_CORS_ORIGINS   = "https://coss.com"
    EMAIL_PROVIDER     = "ses"
    # Twilio's callbacks are verified with each organization's subaccount token (in the database);
    # the parent account's credentials (in the secret) are risk's phone checks'.
    SMS_PROVIDER             = "twilio"
    AWS_REGION               = "us-east-2"
    SES_CONFIGURATION_SET    = "coss"
    SES_TENANT_PREFIX        = "coss"
    INBOUND_MANAGED_DOMAIN   = "inbound.coss.com"
    SES_INBOUND_BUCKET       = "coss-inbound-294417174674"
    TRACKING_DOMAIN_PROVIDER = "cloudflare"
    CLOUDFLARE_ZONE_ID       = "2e3adbb52b68d57dfa5d71a0b7cfa3cc"
    TRACKING_CNAME_TARGET    = "track.cosslinks.com"
    DATABASE_POOL_MAX        = "10"
    VALKEY_CLUSTER           = "true"
    RATE_LIMIT_KEY_PREFIX    = "coss"
    CLIENT_IP_HEADER         = "x-forwarded-for"
    TRUSTED_PROXY_COUNT      = "2"
    # Risk's content classification: the worker's screening model through the AI Gateway
    # (AI_GATEWAY_API_KEY is in the secret). Per-address VPN data stays off (IPinfo isn't a subprocessor).
    RISK_CLASSIFIER = "ai"
    SCREENING_MODEL = "typesafe-ai/jev"
    RISK_IP_PRIVACY = "off"
    # Risk's phone checks: Twilio Lookup's line type and carrier with the parent account
    # (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are in the secret). SIM swaps wait for Twilio's
    # carrier approval (RISK_PHONE_SIM_SWAP).
    RISK_PHONE_LOOKUP = "twilio"
    # Verify's email codes for environments without a sender of their own come from coss.com's
    # (shared SMS numbers, VERIFY_SMS_*, wait for coss.com's own one-time-code registration).
    NOTIFICATIONS_ENVIRONMENT_ID = "env_01m4s0af5zent8fzxwmtkergw5"
    NOTIFICATIONS_FROM           = "coss.com <notifications@coss.com>"
    SENTRY_DSN                   = "https://32c12dc572c854d73947e15894cd2713@o4512237982711808.ingest.de.sentry.io/4512245153398864"
    SENTRY_ENVIRONMENT           = "production"
    SENTRY_TRACES_SAMPLE_RATE    = "0.1"
  }
  worker = {
    SMS_PROVIDER                        = "twilio"
    TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = "BU8b3b683546dc96738212fe3925d344be"
    SMS_SUBACCOUNT_PREFIX               = "coss-production"
    BETTER_AUTH_URL                     = "https://coss.com"
    API_PUBLIC_URL                      = "https://api.coss.com"
    TRACKING_PUBLIC_URL                 = "https://track.cosslinks.com"
    SIGN_PUBLIC_URL                     = "https://cosssign.com"
    SCHEDULING_PUBLIC_URL               = "https://cossbook.com"
    GOOGLE_CALENDAR_CLIENT_ID           = "776019028945-dnuug57hi1tsjfdbu93evm8ggp1ge00q.apps.googleusercontent.com"
    MICROSOFT_CALENDAR_CLIENT_ID        = "e58a0c0d-e1bb-4aef-a861-43c755d96761"
    # Forms (`/f/*` on its own domain, routed to the api) and its uploads bucket.
    FORMS_PUBLIC_URL      = "https://cossforms.com"
    FORMS_FILES_BUCKET    = "coss-production-forms-files-294417174674"
    EMAIL_PROVIDER        = "ses"
    AWS_REGION            = "us-east-2"
    SES_CONFIGURATION_SET = "coss"
    SES_TENANT_PREFIX     = "coss"
    SES_EVENTS_QUEUE_URL  = "https://sqs.us-east-2.amazonaws.com/294417174674/coss-events"
    # Receiving (ses:bootstrap --managed-domain inbound.coss.com).
    INBOUND_MANAGED_DOMAIN = "inbound.coss.com"
    SES_INBOUND_BUCKET     = "coss-inbound-294417174674"
    SES_INBOUND_QUEUE_URL  = "https://sqs.us-east-2.amazonaws.com/294417174674/coss-inbound"
    # The daily inbound limit per organization is counted in Valkey (VALKEY_URL is in the secret).
    VALKEY_CLUSTER           = "true"
    RATE_LIMIT_KEY_PREFIX    = "coss"
    TRACKING_DOMAIN_PROVIDER = "cloudflare"
    CLOUDFLARE_ZONE_ID       = "2e3adbb52b68d57dfa5d71a0b7cfa3cc"
    TRACKING_CNAME_TARGET    = "track.cosslinks.com"
    DATABASE_POOL_MAX        = "10"
    LOG_RETENTION_DAYS       = "30"
    SCREENING_CLASSIFIER     = "ai"
    SCREENING_MODEL          = "typesafe-ai/jev"
    BILLING_PROVIDER         = "stripe"
    # Account and reputation emails go out through coss.com itself, from its own organization.
    NOTIFICATIONS_ENVIRONMENT_ID = "env_01m4s0af5zent8fzxwmtkergw5"
    NOTIFICATIONS_FROM           = "coss.com <notifications@coss.com>"
    # Sign's seal timestamps (PAdES B-T): DigiCert's public TSA, whose chain reaches an unrestricted
    # AATL root. Unused until SIGN_SEALER is set.
    SIGN_TSA_URL = "http://timestamp.digicert.com"
    # Push notifications to the iOS app: the "coss.com push" key (production, topic com.coss.ios).
    APNS_KEY_ID               = "WCQDCU4HUL"
    APNS_TEAM_ID              = "ADWKXDJV75"
    APNS_TOPIC                = "com.coss.ios"
    APNS_ENVIRONMENTS         = "production"
    SENTRY_DSN                = "https://77c5b5b1c87194a0942714259a44dcac@o4512237982711808.ingest.de.sentry.io/4512245153398865"
    SENTRY_ENVIRONMENT        = "production"
    SENTRY_TRACES_SAMPLE_RATE = "0.1"
  }
  smtp = {
    BETTER_AUTH_URL           = "https://coss.com"
    SMTP_HOSTNAME             = "smtp.coss.com"
    TRACKING_PUBLIC_URL       = "https://track.cosslinks.com"
    EMAIL_PROVIDER            = "ses"
    AWS_REGION                = "us-east-2"
    SES_CONFIGURATION_SET     = "coss"
    SES_TENANT_PREFIX         = "coss"
    INBOUND_MANAGED_DOMAIN    = "inbound.coss.com"
    SES_INBOUND_BUCKET        = "coss-inbound-294417174674"
    TRACKING_DOMAIN_PROVIDER  = "cloudflare"
    CLOUDFLARE_ZONE_ID        = "2e3adbb52b68d57dfa5d71a0b7cfa3cc"
    TRACKING_CNAME_TARGET     = "track.cosslinks.com"
    DATABASE_POOL_MAX         = "10"
    VALKEY_CLUSTER            = "true"
    RATE_LIMIT_KEY_PREFIX     = "coss"
    SENTRY_DSN                = "https://868b2bf2f705696c061f86be6597eb68@o4512237982711808.ingest.de.sentry.io/4512262232604752"
    SENTRY_ENVIRONMENT        = "production"
    SENTRY_TRACES_SAMPLE_RATE = "0.1"
  }
}
