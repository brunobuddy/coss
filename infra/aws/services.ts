/**
 * What each deployable runs and needs: the source of truth for ECS task definitions (README.md,
 * "Deploying to AWS", is the human runbook). `bun run --cwd infra aws:spec` prints it as JSON.
 * infra/test checks it against the apps' env schemas, turbo.json and the Dockerfiles.
 */

export type ServiceName =
  | "web"
  | "site"
  | "portal"
  | "sign"
  | "scheduling"
  | "api"
  | "worker"
  | "smtp";

/**
 * - `plain`: a task-definition `environment` value (`value`: the production value, or how to get it).
 * - `secret`: from Secrets Manager (`secrets`/`valueFrom`), one JSON secret per stage.
 * - `image`: already set by the Dockerfile; listed for completeness, don't override.
 */
export type EnvVar = {
  name: string;
  kind: "plain" | "secret" | "image";
  required: boolean;
  value?: string;
  description: string;
};

export type Service = {
  name: ServiceName;
  dockerfile: string;
  /** Container port the ALB target group forwards to (absent: no load balancer). */
  port?: number;
  /** ALB target group health check: HTTP 200 expected. Never touches the database. */
  healthCheckPath?: string;
  /**
   * Plain TCP through the network load balancer (the SMTP relay terminates TLS itself, for
   * STARTTLS): each public `listener` port forwards to a container port. Client addresses are
   * preserved, so tasks see who connected.
   */
  tcpPorts?: { listener: number; container: number }[];
  /** Seconds between SIGTERM and SIGKILL (ECS `stopTimeout`; Fargate allows at most 120). */
  stopTimeout: number;
  /** Fargate size (arm64). A starting point: watch CPU/memory and adjust. */
  cpu: number;
  memory: number;
  minTasks: number;
  /** Public DNS checks and customer webhooks need a NAT gateway (VPC endpoints can't serve them). */
  needsInternet: boolean;
  /** IAM policy created by `ses:bootstrap` (path /coss/, `<name>-…`) to attach to the task role. */
  taskRolePolicy?: string;
  env: EnvVar[];
};

const db: EnvVar[] = [
  {
    name: "DATABASE_URL",
    kind: "secret",
    required: true,
    value:
      "postgres://<user>:<password>@<rds-endpoint>:5432/coss?sslmode=verify-full&sslrootcert=/etc/ssl/certs/rds-global-bundle.pem",
    description: "RDS Postgres over verified TLS (the images ship the RDS CA bundle at that path).",
  },
  {
    name: "DATABASE_POOL_MAX",
    kind: "plain",
    required: false,
    value: "10",
    description: "pg pool size per task. Sum over all tasks must stay below RDS max_connections.",
  },
];

const trackingDomains: EnvVar[] = [
  {
    name: "TRACKING_DOMAIN_PROVIDER",
    kind: "plain",
    required: true,
    value: "cloudflare",
    description: "Custom tracking domains are Cloudflare for SaaS custom hostnames.",
  },
  {
    name: "CLOUDFLARE_API_TOKEN",
    kind: "secret",
    required: true,
    description:
      "Cloudflare API token limited to the coss.com zone with SSL and Certificates: Edit " +
      "(custom hostnames). Same value for web, api and worker.",
  },
  {
    name: "CLOUDFLARE_ZONE_ID",
    kind: "plain",
    required: true,
    description: "The coss.com zone id (Cloudflare dashboard, zone overview).",
  },
  {
    name: "TRACKING_CNAME_TARGET",
    kind: "plain",
    required: false,
    value: "track.cosslinks.com",
    description: "The zone's fallback origin, which customers CNAME their tracking domain to.",
  },
];

const email: EnvVar[] = [
  {
    name: "EMAIL_PROVIDER",
    kind: "plain",
    required: true,
    value: "ses",
    description: "Live environments send through SES.",
  },
  { name: "AWS_REGION", kind: "plain", required: true, description: "Printed by ses:bootstrap." },
  {
    name: "SES_CONFIGURATION_SET",
    kind: "plain",
    required: true,
    description: "Printed by ses:bootstrap.",
  },
  {
    name: "SES_TENANT_PREFIX",
    kind: "plain",
    required: true,
    description: "Printed by ses:bootstrap.",
  },
  {
    name: "INBOUND_MANAGED_DOMAIN",
    kind: "plain",
    required: false,
    value: "inbound.coss.com",
    description:
      "Receiving: each environment's `<label>.<domain>` addresses (ses:bootstrap --managed-domain). " +
      "Set with SES_INBOUND_BUCKET, or neither (receiving off).",
  },
  {
    name: "SES_INBOUND_BUCKET",
    kind: "plain",
    required: false,
    description: "Receiving: the bucket received emails are stored in. Printed by ses:bootstrap.",
  },
  ...trackingDomains,
];

const portalPublicUrl: EnvVar = {
  name: "PORTAL_PUBLIC_URL",
  kind: "plain",
  required: false,
  description:
    "Origin of the Hooks portal (apps/portal, on a registrable domain of its own); portal session links point there. Unset: creating a portal session fails (503) until the portal is deployed.",
};

const signDocumentsBucket: EnvVar = {
  name: "SIGN_DOCUMENTS_BUCKET",
  kind: "plain",
  required: false,
  description:
    "Sign's documents bucket (Terraform output sign_documents_bucket), with AWS_REGION. Unset: Sign is off in production.",
};

const formsFilesBucket: EnvVar = {
  name: "FORMS_FILES_BUCKET",
  kind: "plain",
  required: false,
  description:
    "Forms' bucket of uploaded files (Terraform output forms_files_bucket), with AWS_REGION. Unset: forms refuse uploads in production.",
};

const formsPublicUrl: EnvVar = {
  name: "FORMS_PUBLIC_URL",
  kind: "plain",
  required: false,
  description:
    "Origin forms are served on (a registrable domain of its own, routed to the api service); endpoints are <FORMS_PUBLIC_URL>/f/<id>. Unset: Forms is off.",
};

const awsRegion: EnvVar = {
  name: "AWS_REGION",
  kind: "plain",
  required: false,
  value: "us-east-2",
  description: "Region of Sign's documents bucket.",
};

const schedulingEnv: EnvVar[] = [
  {
    name: "SCHEDULING_DATA_KEYS",
    kind: "secret",
    required: false,
    value:
      "openssl rand -base64 32 (one per stage; losing it makes attendees' details unreadable). A comma-separated list while rotating: the first encrypts, every one decrypts",
    description:
      "Encrypts Scheduling's attendee details and answers. Same value for api and worker.",
  },
  {
    name: "SCHEDULING_PUBLIC_URL",
    kind: "plain",
    required: false,
    description:
      "Origin of the hosted scheduling app (apps/scheduling, on a registrable domain of its own); session and manage links point there. Unset: sessions have no url, and emails have no manage link.",
  },
  {
    name: "GOOGLE_CALENDAR_CLIENT_ID",
    kind: "plain",
    required: false,
    description: "Scheduling's Google OAuth app for calendar access, not sign-in's.",
  },
  {
    name: "GOOGLE_CALENDAR_CLIENT_SECRET",
    kind: "secret",
    required: false,
    value: "From the Google Cloud console.",
    description: "Scheduling's Google OAuth app for calendar access.",
  },
  {
    name: "MICROSOFT_CALENDAR_CLIENT_ID",
    kind: "plain",
    required: false,
    description: "Scheduling's Microsoft app for calendar access.",
  },
  {
    name: "MICROSOFT_CALENDAR_CLIENT_SECRET",
    kind: "secret",
    required: false,
    value: "From the Microsoft Entra admin center.",
    description: "Scheduling's Microsoft app for calendar access.",
  },
];

const signPublicUrl: EnvVar = {
  name: "SIGN_PUBLIC_URL",
  kind: "plain",
  required: false,
  description:
    "Origin of Sign's signing app (apps/sign, on a registrable domain of its own); signing session links point there. Unset: creating a signing session fails (503) until it is deployed.",
};

// Sign's seal (worker): a document-signing certificate whose key is in KMS or at the CA (CSC), and
// a time-stamping authority.
const signSeal: EnvVar[] = [
  {
    name: "SIGN_SEALER",
    kind: "plain",
    required: false,
    description:
      "What seals Sign's completed documents: `kms` (SIGN_SEAL_KMS_KEY_ID + SIGN_SEAL_CERTIFICATE_CHAIN) or `csc` (SIGN_CSC_*: the CA's cloud signing API). Unset: completions wait (Sign is off in production until then).",
  },
  {
    name: "SIGN_SEAL_KMS_KEY_ID",
    kind: "plain",
    required: false,
    description: "The asymmetric KMS signing key (RSA or ECC) behind the seal's certificate.",
  },
  {
    name: "SIGN_SEAL_CERTIFICATE_CHAIN",
    kind: "plain",
    required: false,
    description:
      "The seal's document-signing certificate (on Adobe's trust list) and its intermediates, PEM, leaf first (`\\n` line breaks accepted).",
  },
  {
    name: "SIGN_CSC_URL",
    kind: "plain",
    required: false,
    description:
      "With SIGN_SEALER=csc: the CA's Cloud Signature Consortium API, with its version (SSL.com eSigner: `https://cs.ssl.com/csc/v1`).",
  },
  {
    name: "SIGN_CSC_TOKEN_URL",
    kind: "plain",
    required: false,
    description: "Its OAuth 2.0 token endpoint (SSL.com: `https://login.ssl.com/oauth2/token`).",
  },
  {
    name: "SIGN_CSC_CLIENT_ID",
    kind: "plain",
    required: false,
    description: "The OAuth client registered with the CA for the password grant.",
  },
  {
    name: "SIGN_CSC_CLIENT_SECRET",
    kind: "secret",
    required: false,
    description: "That client's secret, when the CA's client is confidential.",
  },
  {
    name: "SIGN_CSC_USERNAME",
    kind: "plain",
    required: false,
    description: "The CA account the signing credential belongs to.",
  },
  {
    name: "SIGN_CSC_PASSWORD",
    kind: "secret",
    required: false,
    description: "That account's password.",
  },
  {
    name: "SIGN_CSC_CREDENTIAL_ID",
    kind: "plain",
    required: false,
    description:
      "The signing credential (SSL.com eSealing: `credentials/list` with `clientData: DS_ESEAL`).",
  },
  {
    name: "SIGN_CSC_TOTP_SECRET",
    kind: "secret",
    required: false,
    description:
      "Base64 TOTP secret, only for a credential that wants a one-time password per signature (an eSeal doesn't).",
  },
  {
    name: "SIGN_TSA_URL",
    kind: "plain",
    required: false,
    description:
      "An RFC 3161 time-stamping authority: seals carry its timestamp (PAdES B-T), and the validation data of its chain (B-LT).",
  },
];

const rateLimits: EnvVar[] = [
  {
    name: "VALKEY_URL",
    kind: "secret",
    required: true,
    description:
      "ElastiCache Serverless TLS URL printed by valkey:bootstrap; shared by web, api and worker.",
  },
  {
    name: "VALKEY_CLUSTER",
    kind: "plain",
    required: true,
    value: "true",
    description: "ElastiCache Serverless uses the cluster protocol.",
  },
  {
    name: "RATE_LIMIT_KEY_PREFIX",
    kind: "plain",
    required: false,
    value: "coss",
    description: "Counter namespace; must match the cache user's ACL.",
  },
  {
    name: "CLIENT_IP_HEADER",
    kind: "plain",
    required: true,
    value: "x-forwarded-for",
    description: "Enables per-IP limits using the trusted proxy chain.",
  },
  {
    name: "TRUSTED_PROXY_COUNT",
    kind: "plain",
    required: true,
    value: "2",
    description: "CloudFront and ALB append to X-Forwarded-For.",
  },
];

const screening: EnvVar[] = [
  {
    name: "SCREENING_CLASSIFIER",
    kind: "plain",
    required: true,
    value: "ai",
    description: "AI content screening of sampled live emails before they are sent (off|fake|ai).",
  },
  {
    name: "SCREENING_MODEL",
    kind: "plain",
    required: false,
    value: "typesafe-ai/jev",
    description: "Vercel AI Gateway decision model id; any Gateway decision model works.",
  },
  {
    name: "AI_GATEWAY_API_KEY",
    kind: "secret",
    required: true,
    description:
      "Vercel AI Gateway key (zero data retention on: needs a Pro or Enterprise team). Worker " +
      "(content screening), api (risk's content classification) and web (screening hosted form pages).",
  },
];

/** VPN, proxy and relay data per address for risk (a paid provider; off until it's a subprocessor). */
const riskIpPrivacy: EnvVar[] = [
  {
    name: "RISK_IP_PRIVACY",
    kind: "plain",
    required: false,
    value: "off",
    description:
      "Risk's IP privacy data (off|ipinfo): `ipinfo` sends each assessed public IP address to IPinfo's privacy detection. List IPinfo as a subprocessor before turning it on.",
  },
  {
    name: "IPINFO_PRIVACY_TOKEN",
    kind: "secret",
    required: false,
    description:
      "An IPinfo token whose plan includes privacy detection (not the free Lite one). Required with RISK_IP_PRIVACY=ipinfo.",
  },
];

/** The API classifies risk content at request time with the screening model and key. */
const riskClassifier: EnvVar[] = [
  {
    name: "RISK_CLASSIFIER",
    kind: "plain",
    required: true,
    value: "ai",
    description:
      "Risk's content classification in live environments (off|fake|ai): SCREENING_MODEL through the AI Gateway.",
  },
  ...screening.filter((variable) => variable.name !== "SCREENING_CLASSIFIER"),
];

const billingProvider: EnvVar = {
  name: "BILLING_PROVIDER",
  kind: "plain",
  required: true,
  value: "stripe",
  description:
    "Payment provider of new billing accounts (fake|stripe); admins can move one to manual.",
};

const stripeSecretKey: EnvVar = {
  name: "STRIPE_SECRET_KEY",
  kind: "secret",
  required: true,
  value: "A restricted Stripe key (customers, invoices, Checkout, Customer Portal, credit notes)",
  description: "Stripe API key: the dashboard opens Checkout and the portal, the worker invoices.",
};

const smsProvider: EnvVar = {
  name: "SMS_PROVIDER",
  kind: "plain",
  required: true,
  value: "twilio",
  description:
    "Provider of live environments' SMS and of new numbers (fake|twilio). With `fake`, production refuses to provision numbers, so no live SMS goes anywhere.",
};

/**
 * Twilio (SMS): Cal.com's parent account, shared by coss.com; one subaccount per organization. Only
 * with `SMS_PROVIDER=twilio`: until then live SMS is unavailable in production.
 */
const twilio: EnvVar[] = [
  smsProvider,
  {
    name: "TWILIO_ACCOUNT_SID",
    // A secret only to keep Cal.com's account id out of the public repository (GitHub's push
    // protection refuses it in production.tfvars).
    kind: "secret",
    required: false,
    value: "AC… (the parent account)",
    description: "Creates organizations' subaccounts and sends on their behalf.",
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    kind: "secret",
    required: false,
    value: "The parent account's auth token",
    description: "Authenticates the parent account's requests.",
  },
  {
    name: "TWILIO_PRIMARY_CUSTOMER_PROFILE_SID",
    kind: "plain",
    required: false,
    value: "BU… (the ISV's approved primary customer profile)",
    description: "Organizations' US A2P 10DLC brands are registered under it.",
  },
  {
    name: "SMS_SUBACCOUNT_PREFIX",
    kind: "plain",
    required: false,
    value: "coss-<stage>",
    description:
      "Names the subaccounts coss.com creates (`<prefix>-<organization id>`), apart from Cal.com's own.",
  },
];

/**
 * Risk's phone checks: Twilio Lookup with the parent account (`twilio` below). Off until Twilio's
 * purpose in the DPA covers phone lookups; SIM swaps only once Twilio has approved coss.com with
 * the carriers.
 */
const riskPhoneLookup: EnvVar[] = [
  {
    name: "RISK_PHONE_LOOKUP",
    kind: "plain",
    required: false,
    value: "off",
    description:
      "Risk's phone checks in live environments (off|twilio): `twilio` sends each checked number to Twilio Lookup (Line Type Intelligence, paid per lookup). Update Twilio's purpose in the DPA's subprocessors before turning it on.",
  },
  {
    name: "RISK_PHONE_SIM_SWAP",
    kind: "plain",
    required: false,
    value: "false",
    description:
      "`true` also asks Twilio Lookup for the last SIM swap (a private beta: only after Twilio's carrier approval).",
  },
  ...twilio.filter(
    (variable) => variable.name === "TWILIO_ACCOUNT_SID" || variable.name === "TWILIO_AUTH_TOKEN",
  ),
];

const webhookKey: EnvVar = {
  name: "WEBHOOK_SECRETS_KEY",
  kind: "secret",
  required: true,
  value:
    "openssl rand -base64 32 (one per stage; losing it makes endpoint secrets unreadable). A comma-separated " +
    "list while rotating: the first encrypts, every one decrypts",
  description: "Encrypts webhook signing secrets. Same value for web, api and worker.",
};

const emailLinkKeys: EnvVar = {
  name: "EMAIL_LINK_KEYS",
  kind: "secret",
  required: true,
  value:
    "openssl rand -base64 32 (one per stage). A comma-separated list while rotating: the first " +
    "encrypts, every one decrypts. Never drop a key whose links may still be clicked",
  description:
    "Encrypts the preference center, unsubscribe and confirmation links of marketing email. Same value for api and worker.",
};

const riskHashKey: EnvVar = {
  name: "RISK_HASH_KEY",
  kind: "secret",
  required: true,
  value: "openssl rand -base64 32 (one per stage; changing it resets what risk remembers)",
  description:
    "Keys the hashes behind risk's velocity, duplicate detection and fraud memory. Same value for web and api.",
};

const auth: EnvVar[] = [
  {
    name: "BETTER_AUTH_SECRET",
    kind: "secret",
    required: true,
    value: "openssl rand -base64 32 (one per stage)",
    description: "Signs sessions. Same value for web and api.",
  },
  {
    name: "BETTER_AUTH_URL",
    kind: "plain",
    required: true,
    value: "https://coss.com",
    description:
      "Origin of both zones (site and dashboard): base URL, trusted origin, secure cookies.",
  },
];

const trackingPublicUrl: EnvVar = {
  name: "TRACKING_PUBLIC_URL",
  kind: "plain",
  required: false,
  value: "https://track.cosslinks.com",
  description:
    "Origin of the open/click tracking links in emails (defaults to API_PUBLIC_URL): its own " +
    "domain, so abuse flagged by URL blocklists never lands on coss.com (infra/aws/routing.ts).",
};

const apiPublicUrl: EnvVar = {
  name: "API_PUBLIC_URL",
  kind: "plain",
  required: true,
  value: "https://api.coss.com",
  description: "The API's public origin (OpenAPI, dashboard snippets and email tracking URLs).",
};

/**
 * Error and performance monitoring (Sentry organization `cosscom`, see @coss/observability). Each
 * runtime has its own project; DSNs aren't secrets (browsers receive the dashboard's).
 */
function sentry(
  project: "web" | "portal" | "sign" | "scheduling" | "api" | "worker" | "smtp",
): EnvVar[] {
  return [
    {
      name: "SENTRY_DSN",
      kind: "plain",
      required: false,
      value: `DSN of the \`${project}\` Sentry project (Project settings → Client Keys)`,
      description:
        project === "web"
          ? "The dashboard's server and every browser on coss.com (dashboard and site, through /api/monitoring). Unset: nothing is reported."
          : "Unset: nothing is reported.",
    },
    {
      name: "SENTRY_ENVIRONMENT",
      kind: "plain",
      required: false,
      value: "production (the stage's name)",
      description: "Sentry environment; defaults to NODE_ENV.",
    },
    {
      name: "SENTRY_TRACES_SAMPLE_RATE",
      kind: "plain",
      required: false,
      value: "0.1",
      description: "Share of requests/jobs traced (0–1).",
    },
  ];
}

/** Bun services' Sentry release; the Next.js images have theirs built in (NEXT_DEPLOYMENT_ID). */
const sentryRelease: EnvVar = {
  name: "SENTRY_RELEASE",
  kind: "plain",
  required: false,
  value: "Set by the image (build argument SENTRY_RELEASE, the commit); don't override.",
  description: "Sentry release of every event.",
};

/** coss.com's own live environment (worker: sends from it; dashboard: never suspends its org). */
const notificationsEnvironment: EnvVar = {
  name: "NOTIFICATIONS_ENVIRONMENT_ID",
  kind: "plain",
  required: false,
  value: "env_… (a live environment of coss.com's own organization)",
  description:
    "Sends account emails (sign-up verification, password resets, invitations) and " +
    "reputation notifications through coss.com itself (worker), and Verify's email codes for " +
    "environments without a sender of their own (api); neither the worker nor admins " +
    "(dashboard) may suspend its organization. Unset until coss.com's organization has a " +
    "verified domain: both are held, and nobody can verify their email address.",
};

/** coss.com's sender for the API's Verify codes and the worker's notifications. */
const notificationsFrom: EnvVar = {
  name: "NOTIFICATIONS_FROM",
  kind: "plain",
  required: false,
  value: "coss.com <notifications@coss.com>",
  description: "Sender of notification emails, on a verified domain of that organization.",
};

/** Verify's shared numbers (api): coss.com's numbers registered for one-time codes. */
const verifySms: EnvVar[] = [
  {
    name: "VERIFY_SMS_ENVIRONMENT_ID",
    kind: "plain",
    required: false,
    value: "env_… (a live environment of coss.com's own organization)",
    description:
      "Where Verify's codes from coss.com's shared numbers are sent (and billed to each customer as verify.sms). Unset: live SMS codes need the environment's own number.",
  },
  {
    name: "VERIFY_SMS_FROM",
    kind: "plain",
    required: false,
    value: "+1888…,+1415… (approved numbers of that environment's organization)",
    description: "coss.com's shared numbers, comma-separated E.164, registered for one-time codes.",
  },
];

export const SERVICES: Service[] = [
  {
    name: "web",
    dockerfile: "apps/web/Dockerfile",
    port: 3000,
    healthCheckPath: "/api/health",
    stopTimeout: 30,
    cpu: 512,
    memory: 1024,
    minTasks: 2,
    needsInternet: true,
    taskRolePolicy: "dashboard",
    env: [
      ...db,
      ...auth,
      ...rateLimits,
      apiPublicUrl,
      ...email,
      webhookKey,
      portalPublicUrl,
      ...schedulingEnv.filter((variable) => variable.name.startsWith("SCHEDULING_")),
      signPublicUrl,
      signDocumentsBucket,
      formsPublicUrl,
      formsFilesBucket,
      riskHashKey,
      // Screens live hosted form pages published from the dashboard.
      ...riskClassifier,
      notificationsEnvironment,
      {
        name: "SMTP_PUBLIC_HOST",
        kind: "plain",
        required: false,
        value: "smtp.coss.com",
        description:
          "The SMTP relay's host, shown with its settings on environment pages. Set it once the DNS record resolves; unset hides the settings.",
      },
      {
        name: "RISK_SIGNUP_ENVIRONMENT_ID",
        kind: "plain",
        required: false,
        value: "env_… (a live environment of coss.com's own organization)",
        description:
          "coss.com Risk assesses coss.com's own sign-ups in this environment (dogfooding): `block` refuses the sign-up, `review` waits in its review queue. Unset: sign-ups aren't assessed.",
      },
      ...twilio,
      billingProvider,
      stripeSecretKey,
      {
        name: "STRIPE_WEBHOOK_SECRET",
        kind: "secret",
        required: true,
        value:
          "The signing secret of the Stripe webhook endpoint https://coss.com/api/billing/webhook",
        description: "Verifies Stripe webhook signatures (the dashboard's billing webhook route).",
      },
      {
        name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
        kind: "secret",
        required: true,
        value: "openssl rand -base64 32 (one per stage)",
        description: "Shared by every dashboard task so Server Actions work across tasks.",
      },
      {
        name: "TRUSTED_PROXY_HOPS",
        kind: "plain",
        required: true,
        value: "2",
        description:
          "CloudFront + ALB append to X-Forwarded-For; the client is the entry they vouch for.",
      },
      {
        name: "TURNSTILE_SITE_KEY",
        kind: "plain",
        required: true,
        value: "Cloudflare Turnstile widget site key (hostname: the dashboard's)",
        description: "Public; rendered on sign-up, sign-in and password reset.",
      },
      {
        name: "TURNSTILE_SECRET_KEY",
        kind: "secret",
        required: true,
        value: "the same widget's secret key",
        description: "Better Auth's captcha plugin verifies tokens with it (siteverify).",
      },
      {
        name: "GOOGLE_CLIENT_ID",
        kind: "plain",
        required: false,
        value:
          "the Google OAuth client's id (redirect URI https://coss.com/api/auth/callback/google)",
        description: "Sign-in with Google, with GOOGLE_CLIENT_SECRET (both or neither).",
      },
      {
        name: "GOOGLE_CLIENT_SECRET",
        kind: "secret",
        required: false,
        value: "the same OAuth client's secret",
        description: "Sign-in with Google (token exchange).",
      },
      {
        name: "GITHUB_CLIENT_ID",
        kind: "plain",
        required: false,
        value:
          "the GitHub OAuth app's client id (callback https://coss.com/api/auth/callback/github)",
        description: "Sign-in with GitHub, with GITHUB_CLIENT_SECRET (both or neither).",
      },
      {
        name: "GITHUB_CLIENT_SECRET",
        kind: "secret",
        required: false,
        value: "the same OAuth app's client secret",
        description: "Sign-in with GitHub (token exchange).",
      },
      {
        name: "SECURITY_MANAGEMENT_ROLE_ARN",
        kind: "plain",
        required: false,
        value: "the management account's coss-security-read role (infra/organization)",
        description:
          "The admin console's security page. It assumes this role for what only the management account knows: root MFA, the audit trail, outside access.",
      },
      {
        name: "SECURITY_ALERTS_TOPIC_ARN",
        kind: "plain",
        required: false,
        value: "the coss-alerts SNS topic",
        description: "The security page checks a confirmed email subscribes to it.",
      },
      {
        name: "SECURITY_ACCESS_LOGS_BUCKET",
        kind: "plain",
        required: false,
        value: "the access logs bucket (Terraform output access_logs_bucket)",
        description: "The security page checks load balancer and VPC flow logs still arrive.",
      },
      {
        name: "DEPLOY_GITHUB_APP_ID",
        kind: "plain",
        required: false,
        value: 'the coss.com Deploy GitHub App\'s id (README, "Deploying from the admin console")',
        description:
          "The admin console's deploys page, with DEPLOY_GITHUB_APP_PRIVATE_KEY (both or neither).",
      },
      {
        name: "DEPLOY_GITHUB_APP_PRIVATE_KEY",
        kind: "secret",
        required: false,
        value: "the same app's private key (PEM)",
        description:
          "Signs the app's tokens: read main's commits and the Deploy workflow's runs, dispatch it.",
      },
      {
        name: "DOMAIN_CONNECT_KEY_ID",
        kind: "plain",
        required: false,
        value: '_dck1 (the TXT host of the public key under coss.com; README, "Domain Connect")',
        description:
          "Domain Connect (one-click DNS setup), with DOMAIN_CONNECT_PRIVATE_KEY (both or neither).",
      },
      {
        name: "DOMAIN_CONNECT_PRIVATE_KEY",
        kind: "secret",
        required: false,
        value: "the RSA key from `bun run domain-connect:key` (PEM)",
        description:
          "Signs Domain Connect apply links; DNS providers check them against coss.com's TXT records.",
      },
      ...sentry("web"),
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "PORT", kind: "image", required: true, value: "3000", description: "" },
      { name: "HOSTNAME", kind: "image", required: true, value: "0.0.0.0", description: "" },
      {
        name: "KEEP_ALIVE_TIMEOUT",
        kind: "image",
        required: true,
        value: "75000",
        description:
          "Above the ALB idle timeout (60 s), or the ALB may reuse a closing connection (502).",
      },
    ],
  },
  {
    name: "site",
    dockerfile: "apps/site/Dockerfile",
    port: 3002,
    healthCheckPath: "/api/health",
    stopTimeout: 30,
    cpu: 256,
    // At 512 MB a task settled at ~85% within a day or two of each deploy (peaks of 96%).
    memory: 1024,
    minTasks: 2,
    needsInternet: false,
    env: [
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "PORT", kind: "image", required: true, value: "3002", description: "" },
      { name: "HOSTNAME", kind: "image", required: true, value: "0.0.0.0", description: "" },
      {
        name: "KEEP_ALIVE_TIMEOUT",
        kind: "image",
        required: true,
        value: "75000",
        description: "",
      },
    ],
  },
  {
    // The Hooks portal, on its own domain (PORTAL_HOST in routing.ts: Cloudflare → ALB).
    name: "portal",
    dockerfile: "apps/portal/Dockerfile",
    port: 3003,
    healthCheckPath: "/api/health",
    stopTimeout: 30,
    cpu: 256,
    memory: 512,
    minTasks: 2,
    needsInternet: false,
    env: [
      ...db,
      webhookKey,
      ...rateLimits,
      ...sentry("portal"),
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "PORT", kind: "image", required: true, value: "3003", description: "" },
      { name: "HOSTNAME", kind: "image", required: true, value: "0.0.0.0", description: "" },
      {
        name: "KEEP_ALIVE_TIMEOUT",
        kind: "image",
        required: true,
        value: "75000",
        description: "",
      },
    ],
  },
  {
    // Sign's signing app, on its own domain (SIGN_HOST in routing.ts: Cloudflare → ALB). It reads
    // documents and stores signatures in the documents bucket (Terraform's task policy, sign.tf).
    name: "sign",
    dockerfile: "apps/sign/Dockerfile",
    port: 3004,
    healthCheckPath: "/api/health",
    stopTimeout: 30,
    cpu: 256,
    memory: 512,
    minTasks: 2,
    needsInternet: false,
    env: [
      ...db,
      signDocumentsBucket,
      awsRegion,
      ...rateLimits,
      ...sentry("sign"),
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "PORT", kind: "image", required: true, value: "3004", description: "" },
      { name: "HOSTNAME", kind: "image", required: true, value: "0.0.0.0", description: "" },
      {
        name: "KEEP_ALIVE_TIMEOUT",
        kind: "image",
        required: true,
        value: "75000",
        description: "",
      },
    ],
  },
  {
    // Scheduling's hosted pages, on their own domain (SCHEDULING_HOST in routing.ts: Cloudflare →
    // ALB). A client of the API; the database only answers which origins may embed a session.
    name: "scheduling",
    dockerfile: "apps/scheduling/Dockerfile",
    port: 3005,
    healthCheckPath: "/api/health",
    stopTimeout: 30,
    cpu: 256,
    memory: 512,
    minTasks: 2,
    needsInternet: false,
    env: [
      ...db,
      apiPublicUrl,
      ...sentry("scheduling"),
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "PORT", kind: "image", required: true, value: "3005", description: "" },
      { name: "HOSTNAME", kind: "image", required: true, value: "0.0.0.0", description: "" },
      {
        name: "KEEP_ALIVE_TIMEOUT",
        kind: "image",
        required: true,
        value: "75000",
        description: "",
      },
    ],
  },
  {
    name: "api",
    dockerfile: "apps/api/Dockerfile",
    port: 3001,
    healthCheckPath: "/health",
    stopTimeout: 30,
    cpu: 512,
    memory: 1024,
    minTasks: 2,
    needsInternet: true,
    taskRolePolicy: "api",
    env: [
      ...db,
      ...auth,
      ...rateLimits,
      apiPublicUrl,
      {
        name: "API_CORS_ORIGINS",
        kind: "plain",
        required: false,
        value: "https://coss.com",
        description: "Browser origins allowed on /v1/* (the docs' playground).",
      },
      ...email,
      smsProvider,
      trackingPublicUrl,
      webhookKey,
      emailLinkKeys,
      portalPublicUrl,
      signDocumentsBucket,
      ...schedulingEnv,
      signPublicUrl,
      notificationsEnvironment,
      notificationsFrom,
      ...verifySms,
      formsPublicUrl,
      formsFilesBucket,
      riskHashKey,
      ...riskClassifier,
      ...riskIpPrivacy,
      ...riskPhoneLookup,
      ...sentry("api"),
      sentryRelease,
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      { name: "API_PORT", kind: "image", required: true, value: "3001", description: "" },
    ],
  },
  {
    name: "worker",
    dockerfile: "apps/worker/Dockerfile",
    // Lets each loop finish its current item: a webhook attempt (10 s), a domain check, an SQS batch.
    stopTimeout: 120,
    cpu: 256,
    memory: 512,
    minTasks: 1,
    needsInternet: true,
    taskRolePolicy: "worker",
    env: [
      ...db,
      ...email,
      apiPublicUrl,
      trackingPublicUrl,
      signDocumentsBucket,
      formsFilesBucket,
      formsPublicUrl,
      {
        name: "FORMS_NOTIFICATIONS_FROM",
        kind: "plain",
        required: false,
        description:
          "coss.com's sender of form notifications (\"<form name> via coss.com\"), on a verified domain of NOTIFICATIONS_ENVIRONMENT_ID's organization; default NOTIFICATIONS_FROM's address.",
      },
      ...signSeal,
      ...schedulingEnv,
      signPublicUrl,
      {
        name: "SIGN_NOTIFICATIONS_FROM",
        kind: "plain",
        required: false,
        description:
          "coss.com's sender of Sign emails (\"<requester> via coss.com\"), on a verified domain of NOTIFICATIONS_ENVIRONMENT_ID's organization; default NOTIFICATIONS_FROM's address.",
      },
      {
        name: "API_PORT",
        kind: "plain",
        required: false,
        value: "3001",
        description: "Development fallback port when API_PUBLIC_URL is unset.",
      },
      {
        name: "SES_EVENTS_QUEUE_URL",
        kind: "plain",
        required: true,
        description: "Printed by ses:bootstrap.",
      },
      {
        name: "WORKER_LOOPS",
        kind: "plain",
        required: false,
        description:
          "Unset: every loop. A second worker service (same image) with `hooks` runs only Hooks deliveries, so their volume scales apart from everything else.",
      },
      {
        name: "SES_INBOUND_QUEUE_URL",
        kind: "plain",
        required: false,
        description: "Receiving: the queue of SES receipt notifications. Printed by ses:bootstrap.",
      },
      // Counted in Valkey: the daily inbound limit per organization (`email.inbound.day`) and
      // Hooks delivery attempts.
      ...rateLimits.filter((v) =>
        ["VALKEY_URL", "VALKEY_CLUSTER", "RATE_LIMIT_KEY_PREFIX"].includes(v.name),
      ),
      {
        name: "LOG_RETENTION_DAYS",
        kind: "plain",
        required: false,
        value: "30",
        description: "Days of environment logs kept (1-31); expired days are dropped hourly.",
      },
      ...screening,
      webhookKey,
      emailLinkKeys,
      ...twilio,
      billingProvider,
      stripeSecretKey,
      // Hooks delivery attempts are rate limited per endpoint and destination host.
      {
        name: "IPINFO_TOKEN",
        kind: "secret",
        required: false,
        description:
          "IPinfo Lite download token (free account): ASN and country signals for risk assessments. Unset: those signals are missing.",
      },
      {
        name: "BETTER_AUTH_URL",
        kind: "plain",
        required: true,
        value: "https://coss.com",
        description: "The dashboard's origin, for links in reputation notification emails.",
      },
      notificationsEnvironment,
      notificationsFrom,
      {
        name: "APNS_KEY_ID",
        kind: "plain",
        required: false,
        description:
          "Id of the APNs authentication key (.p8) for the iOS app's push notifications. Set with APNS_TEAM_ID and APNS_PRIVATE_KEY; unset: pushes are held.",
      },
      {
        name: "APNS_TEAM_ID",
        kind: "plain",
        required: false,
        description: "Apple Developer team id that owns the iOS app and the APNs key.",
      },
      {
        name: "APNS_PRIVATE_KEY",
        kind: "secret",
        required: false,
        description: "The APNs key's .p8 contents (PEM; `\\n` line breaks are accepted).",
      },
      {
        name: "APNS_TOPIC",
        kind: "plain",
        required: false,
        value: "com.coss.ios",
        description: "The iOS app's bundle id (default com.coss.ios).",
      },
      {
        name: "APNS_ENVIRONMENTS",
        kind: "plain",
        required: false,
        value: "production",
        description:
          "APNs gateways the key is configured for (production, sandbox, or both comma-separated; default both). Devices registered for another are skipped.",
      },
      ...sentry("worker"),
      sentryRelease,
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
    ],
  },
  {
    // The SMTP relay (smtp.coss.com): 465/2465 implicit TLS, 587/2587 STARTTLS, through the NLB.
    name: "smtp",
    dockerfile: "apps/smtp/Dockerfile",
    tcpPorts: [
      { listener: 465, container: 2465 },
      { listener: 2465, container: 2465 },
      { listener: 587, container: 2587 },
      { listener: 2587, container: 2587 },
    ],
    // Lets messages in progress finish (clients get 421 between messages and reconnect).
    stopTimeout: 120,
    cpu: 256,
    memory: 1024,
    minTasks: 2,
    // ACM (the certificate export) has no VPC endpoint here.
    needsInternet: true,
    env: [
      ...db,
      ...auth,
      ...email,
      ...rateLimits.filter((v) =>
        ["VALKEY_URL", "VALKEY_CLUSTER", "RATE_LIMIT_KEY_PREFIX"].includes(v.name),
      ),
      // Required here: sends with tracking on are refused without it (no API_PUBLIC_URL fallback).
      { ...trackingPublicUrl, required: true },
      {
        name: "SMTP_HOSTNAME",
        kind: "plain",
        required: true,
        value: "smtp.coss.com",
        description: "The relay's name: its greeting and its certificate's name.",
      },
      {
        name: "SMTP_TLS_CERTIFICATE_ARN",
        kind: "plain",
        required: true,
        value: "Set by Terraform (aws_acm_certificate.smtp, exportable).",
        description:
          "The relay exports this ACM certificate at start and every 12 hours (ACM renews it).",
      },
      {
        name: "SMTP_TLS_PASSPHRASE",
        kind: "secret",
        required: true,
        value: "openssl rand -base64 32 (any value; it only protects the exported key in transit)",
        description: "Encrypts the private key ACM exports; the relay decrypts it in memory.",
      },
      {
        name: "SMTP_TLS_CERT_FILE",
        kind: "plain",
        required: false,
        description: "Development only (with SMTP_TLS_KEY_FILE): a certificate from files.",
      },
      {
        name: "SMTP_TLS_KEY_FILE",
        kind: "plain",
        required: false,
        description: "Development only: the key of SMTP_TLS_CERT_FILE.",
      },
      ...sentry("smtp"),
      sentryRelease,
      { name: "NODE_ENV", kind: "image", required: true, value: "production", description: "" },
      {
        name: "SMTP_IMPLICIT_TLS_PORT",
        kind: "image",
        required: true,
        value: "2465",
        description: "",
      },
      { name: "SMTP_STARTTLS_PORT", kind: "image", required: true, value: "2587", description: "" },
    ],
  },
];

/** One-off ECS tasks (`aws ecs run-task` with a command override), run from a service's image. */
export const ONE_OFF_TASKS = [
  {
    name: "migrate",
    image: "worker",
    command: ["bun", "packages/db/src/migrate.ts"],
    when: "Before every deploy, alone (never two at once). Needs only DATABASE_URL.",
  },
  {
    name: "ses-bootstrap",
    image: "worker",
    command: [
      "bun",
      "apps/worker/scripts/ses-bootstrap.ts",
      "--name",
      "coss",
      "--tenant-prefix",
      "coss",
      "--managed-domain",
      "inbound.coss.com",
    ],
    when:
      "Once per stage after the first migrate, and after upgrades that change it. Needs DATABASE_URL, " +
      "AWS_REGION and a task role allowed to manage SES, SNS, SQS, EventBridge, S3, IAM and CloudWatch.",
  },
  {
    name: "create-admin",
    image: "api",
    command: ["bun", "packages/tenancy/scripts/create-admin.ts", "--email", "<email>"],
    when: "Once, after that user signed up: makes them a platform admin. Run with the api service's environment.",
  },
  {
    name: "webhooks-reencrypt",
    image: "worker",
    command: ["bun", "apps/worker/scripts/webhooks-reencrypt.ts"],
    when:
      "When rotating WEBHOOK_SECRETS_KEY, after every service runs with the new key first: moves endpoint " +
      "secrets onto it so older keys can be removed. Needs DATABASE_URL and WEBHOOK_SECRETS_KEY.",
  },
] as const;
