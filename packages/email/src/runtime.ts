/**
 * Builds the email product's providers from configuration. Apps validate their environment and
 * pass it here, so the API, dashboard and worker all wire providers the same way.
 */
import type { PlanGate } from "@coss/billing/gate";
import {
  type CloudFrontTrackingConfig,
  CloudFrontTrackingHostnameProvider,
  createCloudFrontTenantsApi,
} from "./cloudfront/tenants.ts";
import type { DnsResolver } from "./dns.ts";
import { publicDnsResolver } from "./dns.ts";
import type { DomainDeps } from "./domains.ts";
import {
  DEFAULT_FAKE_INBOUND_DOMAIN,
  DEFAULT_FAKE_TRACKING_CNAME_TARGET,
  type EmailEnv,
  type EmailProviderName,
} from "./env.ts";
import { FakeInboundStore, type InboundContentStore } from "./inbound-store.ts";
import { DEVELOPMENT_LINK_KEYS, type LinkKeyRing, parseLinkKeys } from "./link-tokens.ts";
import type { DedicatedIpProvider, EmailProvider, IdentityProvider } from "./provider.ts";
import { FakeEmailProvider } from "./providers/fake.ts";
import { FakeDedicatedIpProvider } from "./providers/fake-dedicated-ips.ts";
import { FakeIdentityProvider } from "./providers/fake-identity.ts";
import { FakeTrackingHostnameProvider } from "./providers/fake-tracking-hostnames.ts";
import type { ReceivingConfig } from "./receiving-domains.ts";
import { configurationSetsFor, createSesApi, type SesApi, type SesConfig } from "./ses/api.ts";
import { SesDedicatedIpProvider } from "./ses/dedicated-ips.ts";
import { SesIdentityProvider } from "./ses/identity.ts";
import { createS3Api, type S3Api, S3InboundStore } from "./ses/inbound.ts";
import { SesEmailProvider } from "./ses/provider.ts";
import type { TrackingHostnameProvider } from "./tracking-hostnames.ts";

export {
  DEFAULT_FAKE_INBOUND_DOMAIN,
  EMAIL_PROVIDERS,
  type EmailEnv,
  type EmailProviderName,
  emailEnvShape,
  emailWorkerEnvShape,
  TRACKING_DOMAIN_PROVIDERS,
  type TrackingDomainProviderName,
} from "./env.ts";

/** What serves custom tracking hostnames (default: the fake). */
export type TrackingRuntimeConfig =
  | { provider: "fake"; cnameTarget?: string }
  | ({ provider: "cloudfront" } & CloudFrontTrackingConfig);

/** Receiving: coss.com's managed inbound domain, and the S3 bucket with SES. */
export type InboundRuntimeConfig = { managedDomain: string; bucket?: string; s3Api?: S3Api };

export type EmailRuntimeConfig = (
  | { provider: "fake"; log?: boolean }
  | { provider: "ses"; ses: SesConfig; log?: boolean; sesApi?: SesApi; dns?: DnsResolver | null }
) & {
  tracking?: TrackingRuntimeConfig;
  /** Unset with SES means receiving is off; the fake provider always receives. */
  inbound?: InboundRuntimeConfig;
};

/** The tracking hostname config for validated app env; `cloudfront` requires its variables. */
function trackingRuntimeConfig(env: EmailEnv): TrackingRuntimeConfig {
  const { TRACKING_DISTRIBUTION_ID, TRACKING_CONNECTION_GROUP_ID, TRACKING_CNAME_TARGET } = env;
  if (env.TRACKING_DOMAIN_PROVIDER !== "cloudfront") {
    return {
      provider: "fake",
      cnameTarget: TRACKING_CNAME_TARGET || DEFAULT_FAKE_TRACKING_CNAME_TARGET,
    };
  }
  if (!TRACKING_DISTRIBUTION_ID || !TRACKING_CONNECTION_GROUP_ID || !TRACKING_CNAME_TARGET) {
    throw new Error(
      "TRACKING_DOMAIN_PROVIDER=cloudfront requires TRACKING_DISTRIBUTION_ID, " +
        "TRACKING_CONNECTION_GROUP_ID and TRACKING_CNAME_TARGET.",
    );
  }
  return {
    provider: "cloudfront",
    distributionId: TRACKING_DISTRIBUTION_ID,
    connectionGroupId: TRACKING_CONNECTION_GROUP_ID,
    cnameTarget: TRACKING_CNAME_TARGET,
  };
}

/** The runtime config for validated app env; `EMAIL_PROVIDER=ses` requires the SES variables. */
export function emailRuntimeConfig(env: EmailEnv): EmailRuntimeConfig {
  const tracking = trackingRuntimeConfig(env);
  if (env.EMAIL_PROVIDER === "fake") {
    const managedDomain = env.INBOUND_MANAGED_DOMAIN || DEFAULT_FAKE_INBOUND_DOMAIN;
    return { provider: "fake", tracking, inbound: { managedDomain } };
  }
  const { AWS_REGION, SES_CONFIGURATION_SET, SES_TENANT_PREFIX } = env;
  if (!AWS_REGION || !SES_CONFIGURATION_SET || !SES_TENANT_PREFIX) {
    throw new Error(
      "EMAIL_PROVIDER=ses requires AWS_REGION, SES_CONFIGURATION_SET and SES_TENANT_PREFIX " +
        "(see `bun run ses:bootstrap`).",
    );
  }
  const { INBOUND_MANAGED_DOMAIN, SES_INBOUND_BUCKET } = env;
  if (Boolean(INBOUND_MANAGED_DOMAIN) !== Boolean(SES_INBOUND_BUCKET)) {
    throw new Error(
      "Receiving with EMAIL_PROVIDER=ses needs both INBOUND_MANAGED_DOMAIN and SES_INBOUND_BUCKET " +
        "(see `bun run ses:bootstrap`), or neither.",
    );
  }
  return {
    provider: "ses",
    ses: {
      region: AWS_REGION,
      configurationSets: configurationSetsFor(SES_CONFIGURATION_SET),
      tenantPrefix: SES_TENANT_PREFIX,
    },
    tracking,
    ...(INBOUND_MANAGED_DOMAIN && SES_INBOUND_BUCKET
      ? { inbound: { managedDomain: INBOUND_MANAGED_DOMAIN, bucket: SES_INBOUND_BUCKET } }
      : {}),
  };
}

export type EmailRuntime = {
  provider: EmailProviderName;
  liveProvider: EmailProvider;
  /** Sandbox environments always use the fake provider, whatever live environments use. */
  sandboxProvider: EmailProvider;
  identity: IdentityProvider;
  /** `null` with the fake provider: its domains verify without DNS. */
  dns: DnsResolver | null;
  trackingHostnames: TrackingHostnameProvider;
  /** Dedicated IP pools (the Dedicated IPs add-on), of the live provider. */
  dedicatedIps: DedicatedIpProvider;
  domainDeps: DomainDeps;
  /** Receiving (`null`: off, so receiving endpoints answer `receiving_unavailable`). */
  inbound: InboundRuntime | null;
};

export type InboundRuntime = ReceivingConfig & { store: InboundContentStore };

/** SES's inbound mail exchange of a region. */
/**
 * The key ring of marketing email's links (`EMAIL_LINK_KEYS`): required in production, the fixed
 * development keys otherwise (links minted with them only work where they are used).
 */
export function linkKeysFromEnv(
  env: { EMAIL_LINK_KEYS?: string | undefined },
  production: boolean = process.env.NODE_ENV === "production",
): LinkKeyRing {
  if (env.EMAIL_LINK_KEYS) return parseLinkKeys(env.EMAIL_LINK_KEYS);
  if (production) {
    throw new Error("EMAIL_LINK_KEYS is required in production (openssl rand -base64 32).");
  }
  return DEVELOPMENT_LINK_KEYS;
}

export function sesInboundMxHost(region: string): string {
  return `inbound-smtp.${region}.amazonaws.com`;
}

function createTrackingHostnameProvider(
  config: TrackingRuntimeConfig | undefined,
): TrackingHostnameProvider {
  if (config?.provider === "cloudfront") {
    return new CloudFrontTrackingHostnameProvider(config, createCloudFrontTenantsApi());
  }
  return new FakeTrackingHostnameProvider({
    cnameTarget: config?.cnameTarget ?? DEFAULT_FAKE_TRACKING_CNAME_TARGET,
  });
}

/** `plans`: the organization's plan limits on domains (the apps pass `createPlanGate()`). */
export function createEmailRuntime(
  config: EmailRuntimeConfig,
  extras: { plans?: PlanGate } = {},
): EmailRuntime {
  const sandboxProvider = new FakeEmailProvider({ log: config.log });
  let liveProvider: EmailProvider;
  let identity: IdentityProvider;
  let dns: DnsResolver | null;
  let dedicatedIps: DedicatedIpProvider;
  switch (config.provider) {
    case "fake":
      liveProvider = new FakeEmailProvider({ log: config.log });
      identity = new FakeIdentityProvider();
      dedicatedIps = new FakeDedicatedIpProvider();
      dns = null;
      break;
    case "ses": {
      const api = config.sesApi ?? createSesApi(config.ses.region);
      liveProvider = new SesEmailProvider(api, config.ses);
      identity = new SesIdentityProvider(api, config.ses);
      dedicatedIps = new SesDedicatedIpProvider(api, config.ses);
      dns = config.dns === undefined ? publicDnsResolver() : config.dns;
      break;
    }
  }
  const trackingHostnames = createTrackingHostnameProvider(config.tracking);
  let inbound: InboundRuntime | null = null;
  if (config.inbound) {
    const managedDomain = config.inbound.managedDomain.toLowerCase().replace(/\.$/, "");
    if (config.provider === "fake") {
      inbound = {
        store: new FakeInboundStore(),
        managedDomain,
        mxHost: sesInboundMxHost("us-east-1"),
      };
    } else if (config.inbound.bucket) {
      const s3 = config.inbound.s3Api ?? createS3Api(config.ses.region);
      inbound = {
        store: new S3InboundStore(s3, config.inbound.bucket),
        managedDomain,
        mxHost: sesInboundMxHost(config.ses.region),
      };
    }
  }
  return {
    provider: config.provider,
    liveProvider,
    sandboxProvider,
    identity,
    dns,
    trackingHostnames,
    dedicatedIps,
    domainDeps: {
      identity,
      dns,
      tracking: trackingHostnames,
      dedicatedIps,
      plans: extras.plans,
      // DMARC reports arrive through receiving, at the managed inbound domain.
      dmarcReportDomain: inbound?.managedDomain ?? null,
    },
    inbound,
  };
}
