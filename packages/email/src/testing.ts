/**
 * Email test fixtures. Every call creates new, uniquely named rows (tests never truncate).
 * Requires the `@coss/db/testing` preload.
 */

import type {
  CreateEmailIdentityCommandInput,
  CreateTenantCommandInput,
  SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { db, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import type {
  CloudFrontCertificate,
  CloudFrontTenant,
  CloudFrontTenantsApi,
  CreateCloudFrontTenantInput,
} from "./cloudfront/tenants.ts";
import type { EmailDispatchJob, EmailDispatchQueue } from "./dispatch.ts";
import type { DnsResolver } from "./dns.ts";
import type { DomainRow } from "./domains.ts";
import { DEVELOPMENT_LINK_KEYS } from "./link-tokens.ts";
import type { EmailProvider } from "./provider.ts";
import { createEmailService, type EmailService, type EmailServiceOptions } from "./service.ts";
import type { SesApi } from "./ses/api.ts";
import type { S3Api } from "./ses/inbound.ts";

export type MemoryDispatchQueue = EmailDispatchQueue & {
  /** Every enqueued job, oldest first (including jobs of rolled-back transactions). */
  readonly jobs: EmailDispatchJob[];
  /** Dispatches and forgets every recorded job, like the worker would. */
  drain(service: Pick<EmailService, "dispatch">): Promise<void>;
};

/** A dispatch queue that records jobs in memory instead of using pg-boss. */
export function memoryDispatchQueue(): MemoryDispatchQueue {
  const jobs: EmailDispatchJob[] = [];
  return {
    jobs,
    async enqueue(_tx, job) {
      jobs.push(job);
    },
    async drain(service) {
      for (const job of jobs.splice(0)) await service.dispatch(job);
    },
  };
}

/**
 * An email service whose `send` (and `sendBatch`) also dispatches the new email before returning (as the worker
 * would right after): for tests about what happens once an email is handed to its provider.
 * Replays are returned as stored.
 */
export function dispatchingEmailService(opts: {
  liveProvider: EmailProvider;
  sandboxProvider: EmailProvider;
  screen?: EmailServiceOptions["screen"];
  screeningImages?: EmailServiceOptions["screeningImages"];
  screeningFailureAllowlist?: EmailServiceOptions["screeningFailureAllowlist"];
  trackingBaseUrl?: string;
  trackingDomainProvider?: string;
  billing?: EmailServiceOptions["billing"];
  /** Defaults to the development keys. */
  linkKeys?: EmailServiceOptions["linkKeys"];
}): EmailService & { queue: MemoryDispatchQueue } {
  const queue = memoryDispatchQueue();
  const service = createEmailService({
    linkKeys: DEVELOPMENT_LINK_KEYS,
    ...opts,
    queue,
  });
  return {
    queue,
    dispatch: service.dispatch,
    dispatchDue: service.dispatchDue,
    messageIdOf: service.messageIdOf,
    cancel: service.cancel,
    reschedule: service.reschedule,
    replay: service.replay,
    replayBatch: service.replayBatch,
    async sendBatch(input) {
      const result = await service.sendBatch(input);
      if (result.replayed) return result;
      queue.jobs.splice(0);
      const data = [];
      for (const email of result.batch.data) {
        data.push(
          await service.dispatch({
            organizationId: input.environment.organizationId,
            emailId: email.id,
          }),
        );
      }
      return { batch: { ...result.batch, data }, replayed: false };
    },
    async send(input) {
      const result = await service.send(input);
      if (result.replayed) return result;
      queue.jobs.splice(0);
      const email = await service.dispatch({
        organizationId: input.environment.organizationId,
        emailId: result.email.id,
      });
      return { email, replayed: false };
    },
  };
}

/**
 * A verified, sendable domain of the organization, inserted directly (no provider involved).
 * Live sends must use a From address on it, e.g. `hello@${domain.name}`, through a live provider
 * named `provider` (default `fake`).
 */
export async function createVerifiedDomain(
  organizationId: string,
  opts: { name?: string; provider?: string } = {},
): Promise<DomainRow> {
  const name = opts.name ?? `t-${uniqueSuffix()}.coss.test`;
  const now = new Date();
  const [row] = await db
    .insert(schema.domain)
    .values({
      organizationId,
      name,
      status: "verified",
      canSend: true,
      provider: opts.provider ?? "fake",
      region: "us-east-1",
      dkimTokens: ["token1", "token2", "token3"],
      dkimHostedZone: "dkim.amazonses.com",
      mailFromDomain: `send.${name}`,
      mailFromStatus: "success",
      verifiedAt: now,
      lastCheckedAt: now,
    })
    .returning();
  if (!row) throw new Error("Domain insert returned no row.");
  return row;
}

/** A DNS resolver answering from a map of `TYPE name` → answers; everything else is ENOTFOUND. */
export function fakeDnsResolver(records: Record<string, unknown[]>): DnsResolver {
  const answer = async <T>(key: string): Promise<T[]> => {
    const found = records[key];
    if (!found) throw Object.assign(new Error(`queryA ENOTFOUND ${key}`), { code: "ENOTFOUND" });
    return found as T[];
  };
  return {
    resolveCname: (name) => answer(`CNAME ${name}`),
    resolveMx: (name) => answer(`MX ${name}`),
    resolveTxt: (name) => answer(`TXT ${name}`),
  };
}

function sesError(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}

/**
 * An in-memory SES v2 for tests: tenants, identities, associations and sent messages, with the
 * same exception names as SES. `calls` records every operation in order.
 */
export class FakeSesApi implements SesApi {
  readonly account = "123456789012";
  readonly region: string;
  readonly calls: { operation: string; input: unknown }[] = [];
  readonly sent: SendEmailCommandInput[] = [];
  readonly tenants = new Map<string, { arn: string }>();
  readonly identities = new Map<
    string,
    { tokens: string[]; status: string; canSend: boolean; mailFrom: string | null }
  >();
  /** `resourceArn` → tags. */
  readonly tags = new Map<string, { Key: string; Value: string }[]>();
  /** `resourceArn` → tenant names. */
  readonly associations = new Map<string, Set<string>>();
  /** Queue errors (by operation) to throw on the next calls. */
  readonly failures = new Map<string, Error[]>();
  /** Dedicated IP pools by name, with the IPs SES assigned. */
  readonly pools = new Map<string, { scalingMode: string; ips: string[] }>();
  /** Configuration sets by name: their pool and event destinations. */
  readonly configurationSets = new Map<
    string,
    { poolName: string | null; destinations: Map<string, unknown> }
  >();

  constructor(region = "eu-west-1") {
    this.region = region;
  }

  fail(operation: string, name: string, times = 1): void {
    this.failures.set(operation, [
      ...(this.failures.get(operation) ?? []),
      ...Array.from({ length: times }, () => sesError(name)),
    ]);
  }

  #record(operation: string, input: unknown): void {
    this.calls.push({ operation, input });
    const next = this.failures.get(operation)?.shift();
    if (next) throw next;
  }

  identityArn(domain: string): string {
    return `arn:aws:ses:${this.region}:${this.account}:identity/${domain}`;
  }

  configurationSetArn(name: string): string {
    return `arn:aws:ses:${this.region}:${this.account}:configuration-set/${name}`;
  }

  poolArn(name: string): string {
    return `arn:aws:ses:${this.region}:${this.account}:dedicated-ip-pool/${name}`;
  }

  /** What `ses:bootstrap` creates: the shared configuration set publishing events to SNS. */
  bootstrap(configurationSet: string): void {
    this.configurationSets.set(configurationSet, {
      poolName: null,
      destinations: new Map([
        [
          "coss-events",
          {
            Name: "coss-events",
            Enabled: true,
            MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT"],
            SnsDestination: {
              TopicArn: `arn:aws:sns:${this.region}:${this.account}:coss-ses-events`,
            },
          },
        ],
      ]),
    });
  }

  async sendEmail(input: SendEmailCommandInput) {
    this.#record("sendEmail", input);
    this.sent.push(input);
    return { MessageId: `ses-${this.sent.length}`, $metadata: {} };
  }

  async createTenant(input: CreateTenantCommandInput) {
    this.#record("createTenant", input);
    const name = input.TenantName ?? "";
    if (this.tenants.has(name)) throw sesError("AlreadyExistsException");
    const arn = `arn:aws:ses:${this.region}:${this.account}:tenant/${name}/t-${this.tenants.size + 1}`;
    this.tenants.set(name, { arn });
    return { TenantName: name, TenantArn: arn, SendingStatus: "ENABLED" as const, $metadata: {} };
  }

  async putTenantSuppressionAttributes(input: { TenantName?: string }) {
    this.#record("putTenantSuppressionAttributes", input);
    if (!this.tenants.has(input.TenantName ?? "")) throw sesError("NotFoundException");
    return {};
  }

  async getTenant(input: { TenantName: string }) {
    this.#record("getTenant", input);
    const tenant = this.tenants.get(input.TenantName);
    if (!tenant) throw sesError("NotFoundException");
    return { Tenant: { TenantName: input.TenantName, TenantArn: tenant.arn }, $metadata: {} };
  }

  async deleteTenant(input: { TenantName: string }) {
    this.#record("deleteTenant", input);
    if (!this.tenants.delete(input.TenantName)) throw sesError("NotFoundException");
    // SES removes the tenant's resource associations with it.
    for (const tenants of this.associations.values()) tenants.delete(input.TenantName);
    return {};
  }

  async createTenantResourceAssociation(input: { TenantName?: string; ResourceArn?: string }) {
    this.#record("createTenantResourceAssociation", input);
    const tenants = this.associations.get(input.ResourceArn ?? "") ?? new Set<string>();
    if (tenants.has(input.TenantName ?? "")) throw sesError("AlreadyExistsException");
    tenants.add(input.TenantName ?? "");
    this.associations.set(input.ResourceArn ?? "", tenants);
    return {};
  }

  async deleteTenantResourceAssociation(input: { TenantName?: string; ResourceArn?: string }) {
    this.#record("deleteTenantResourceAssociation", input);
    const tenants = this.associations.get(input.ResourceArn ?? "");
    if (!tenants?.delete(input.TenantName ?? "")) throw sesError("NotFoundException");
    return {};
  }

  async listResourceTenants(input: { ResourceArn: string }) {
    this.#record("listResourceTenants", input);
    const tenants = [...(this.associations.get(input.ResourceArn) ?? [])];
    return { ResourceTenants: tenants.map((TenantName) => ({ TenantName })), $metadata: {} };
  }

  async createEmailIdentity(input: CreateEmailIdentityCommandInput) {
    this.#record("createEmailIdentity", input);
    const domain = input.EmailIdentity ?? "";
    if (this.identities.has(domain)) throw sesError("AlreadyExistsException");
    const tokens = [1, 2, 3].map((n) => `${domain.replaceAll(".", "")}tok${n}${this.calls.length}`);
    this.identities.set(domain, { tokens, status: "PENDING", canSend: false, mailFrom: null });
    this.tags.set(
      this.identityArn(domain),
      (input.Tags ?? []).map((tag) => ({ Key: tag.Key ?? "", Value: tag.Value ?? "" })),
    );
    return {
      IdentityType: "DOMAIN" as const,
      VerifiedForSendingStatus: false,
      DkimAttributes: { Tokens: tokens, SigningHostedZone: "dkim.amazonses.com" },
      $metadata: {},
    };
  }

  async getEmailIdentity(input: { EmailIdentity: string }) {
    this.#record("getEmailIdentity", input);
    const identity = this.identities.get(input.EmailIdentity);
    if (!identity) throw sesError("NotFoundException");
    return {
      VerifiedForSendingStatus: identity.canSend,
      DkimAttributes: {
        Tokens: identity.tokens,
        SigningHostedZone: "dkim.amazonses.com",
        Status: identity.status as "PENDING",
      },
      MailFromAttributes: identity.mailFrom
        ? {
            MailFromDomain: identity.mailFrom,
            MailFromDomainStatus: (identity.canSend ? "SUCCESS" : "PENDING") as "PENDING",
            BehaviorOnMxFailure: "USE_DEFAULT_VALUE" as const,
          }
        : undefined,
      $metadata: {},
    };
  }

  async deleteEmailIdentity(input: { EmailIdentity: string }) {
    this.#record("deleteEmailIdentity", input);
    if (!this.identities.delete(input.EmailIdentity)) throw sesError("NotFoundException");
    this.tags.delete(this.identityArn(input.EmailIdentity));
    return {};
  }

  async listTagsForResource(input: { ResourceArn: string }) {
    this.#record("listTagsForResource", input);
    const [kind, name = ""] = (input.ResourceArn.split(":")[5] ?? "").split("/");
    const exists =
      kind === "identity"
        ? this.identities.has(name)
        : kind === "dedicated-ip-pool"
          ? this.pools.has(name)
          : kind === "configuration-set"
            ? this.configurationSets.has(name)
            : false;
    if (!exists) throw sesError("NotFoundException");
    return { Tags: this.tags.get(input.ResourceArn) ?? [], $metadata: {} };
  }

  async createDedicatedIpPool(input: {
    PoolName?: string;
    ScalingMode?: string;
    Tags?: { Key?: string; Value?: string }[];
  }) {
    this.#record("createDedicatedIpPool", input);
    const name = input.PoolName ?? "";
    if (this.pools.has(name)) throw sesError("AlreadyExistsException");
    this.pools.set(name, { scalingMode: input.ScalingMode ?? "STANDARD", ips: [] });
    this.tags.set(
      this.poolArn(name),
      (input.Tags ?? []).map((tag) => ({ Key: tag.Key ?? "", Value: tag.Value ?? "" })),
    );
    return {};
  }

  async deleteDedicatedIpPool(input: { PoolName: string }) {
    this.#record("deleteDedicatedIpPool", input);
    const inUse = [...this.configurationSets.values()].some(
      (set) => set.poolName === input.PoolName,
    );
    if (inUse) throw sesError("ConcurrentModificationException", "The pool is in use.");
    if (!this.pools.delete(input.PoolName)) throw sesError("NotFoundException");
    this.tags.delete(this.poolArn(input.PoolName));
    return {};
  }

  async getDedicatedIps(input: { PoolName: string; NextToken?: string; PageSize?: number }) {
    this.#record("getDedicatedIps", input);
    const pool = this.pools.get(input.PoolName);
    if (!pool) throw sesError("NotFoundException");
    return {
      DedicatedIps: pool.ips.map((Ip) => ({
        Ip,
        WarmupStatus: "NOT_APPLICABLE" as const,
        WarmupPercentage: -1,
        PoolName: input.PoolName,
      })),
      $metadata: {},
    };
  }

  async createConfigurationSet(input: {
    ConfigurationSetName?: string;
    DeliveryOptions?: { SendingPoolName?: string };
    Tags?: { Key?: string; Value?: string }[];
  }) {
    this.#record("createConfigurationSet", input);
    const name = input.ConfigurationSetName ?? "";
    if (this.configurationSets.has(name)) throw sesError("AlreadyExistsException");
    const poolName = input.DeliveryOptions?.SendingPoolName ?? null;
    if (poolName && !this.pools.has(poolName)) throw sesError("NotFoundException");
    this.configurationSets.set(name, { poolName, destinations: new Map() });
    this.tags.set(
      this.configurationSetArn(name),
      (input.Tags ?? []).map((tag) => ({ Key: tag.Key ?? "", Value: tag.Value ?? "" })),
    );
    return {};
  }

  async putConfigurationSetDeliveryOptions(input: {
    ConfigurationSetName: string;
    SendingPoolName?: string;
    TlsPolicy: "REQUIRE" | "OPTIONAL";
  }) {
    this.#record("putConfigurationSetDeliveryOptions", input);
    if (!this.configurationSets.has(input.ConfigurationSetName)) {
      throw sesError("NotFoundException");
    }
    return {};
  }

  async deleteConfigurationSet(input: { ConfigurationSetName: string }) {
    this.#record("deleteConfigurationSet", input);
    if (this.associations.get(this.configurationSetArn(input.ConfigurationSetName))?.size) {
      throw sesError("ConflictException", "The configuration set is associated with a tenant.");
    }
    if (!this.configurationSets.delete(input.ConfigurationSetName)) {
      throw sesError("NotFoundException");
    }
    this.tags.delete(this.configurationSetArn(input.ConfigurationSetName));
    return {};
  }

  async getConfigurationSetEventDestinations(input: { ConfigurationSetName: string }) {
    this.#record("getConfigurationSetEventDestinations", input);
    const set = this.configurationSets.get(input.ConfigurationSetName);
    if (!set) throw sesError("NotFoundException");
    return {
      EventDestinations: [...set.destinations.values()] as {
        Name: string;
        MatchingEventTypes: [];
      }[],
      $metadata: {},
    };
  }

  async createConfigurationSetEventDestination(input: {
    ConfigurationSetName?: string;
    EventDestinationName?: string;
    EventDestination?: object;
  }) {
    this.#record("createConfigurationSetEventDestination", input);
    const set = this.configurationSets.get(input.ConfigurationSetName ?? "");
    if (!set) throw sesError("NotFoundException");
    const name = input.EventDestinationName ?? "";
    if (set.destinations.has(name)) throw sesError("AlreadyExistsException");
    set.destinations.set(name, { Name: name, ...input.EventDestination });
    return {};
  }

  async putEmailIdentityMailFromAttributes(input: {
    EmailIdentity?: string;
    MailFromDomain?: string;
  }) {
    this.#record("putEmailIdentityMailFromAttributes", input);
    const identity = this.identities.get(input.EmailIdentity ?? "");
    if (!identity) throw sesError("NotFoundException");
    identity.mailFrom = input.MailFromDomain ?? null;
    return {};
  }

  /** What SES does once the DKIM records are published. */
  verify(domain: string): void {
    const identity = this.identities.get(domain);
    if (!identity) throw new Error(`no identity ${domain}`);
    identity.status = "SUCCESS";
    identity.canSend = true;
  }

  operations(): string[] {
    return this.calls.map((call) => call.operation);
  }
}

/** The tracking URLs `instrumentHtml` put into an outbound HTML body, in document order. */
export function trackingUrls(html: string): { open: string | null; clicks: string[] } {
  const open = /src="([^"]*\/t\/o\/[A-Za-z0-9_-]+)"/.exec(html)?.[1] ?? null;
  const clicks = [...html.matchAll(/href="([^"]*\/t\/c\/[A-Za-z0-9_-]+\/\d+)"/g)].map(
    (match) => match[1] ?? "",
  );
  return { open, clicks };
}

function cloudFrontError(name: string): Error {
  return Object.assign(new Error(`CloudFront: ${name}`), { name });
}

export type FakeCloudFrontTenant = {
  id: string;
  distributionId: string;
  name: string;
  hostname: string;
  enabled: boolean;
  disableDeployed: boolean;
  domainStatus: string;
  certificateStatus: string | null;
  issuedCertificateArn: string | null;
  attachedCertificateArn: string | null;
  etag: string;
};

/**
 * CloudFront's distribution tenants in memory. Tenants start pending; `issueCertificate` is what
 * CloudFront does once the CNAME resolves, and `activate` once the certificate is attached too. A
 * disabled tenant can only be removed after `deployDisable`.
 */
export class FakeCloudFrontTenantsApi implements CloudFrontTenantsApi {
  readonly tenants = new Map<string, FakeCloudFrontTenant>();
  readonly calls: { operation: string; input: unknown }[] = [];
  /** Makes the next call fail with an error of this name. */
  failNext: string | null = null;
  /** The next `create` succeeds at CloudFront, but its answer never arrives. */
  loseNextCreateAnswer = false;
  #next = 0;

  #record(operation: string, input: unknown): void {
    this.calls.push({ operation, input });
    if (this.failNext) {
      const name = this.failNext;
      this.failNext = null;
      throw cloudFrontError(name);
    }
  }

  #view(tenant: FakeCloudFrontTenant): CloudFrontTenant {
    return {
      id: tenant.id,
      distributionId: tenant.distributionId,
      hostname: tenant.hostname,
      enabled: tenant.enabled,
      domainStatus: tenant.domainStatus,
      certificateArn: tenant.attachedCertificateArn,
      etag: tenant.etag,
    };
  }

  #current(id: string, etag: string): FakeCloudFrontTenant {
    const tenant = this.tenants.get(id);
    if (!tenant) throw cloudFrontError("EntityNotFound");
    if (tenant.etag !== etag) throw cloudFrontError("PreconditionFailed");
    return tenant;
  }

  async create(input: CreateCloudFrontTenantInput): Promise<CloudFrontTenant> {
    this.#record("create", input);
    const existing = [...this.tenants.values()];
    if (existing.some((tenant) => tenant.hostname === input.hostname)) {
      throw cloudFrontError("CNAMEAlreadyExists");
    }
    if (existing.some((tenant) => tenant.name === input.name)) {
      throw cloudFrontError("EntityAlreadyExists");
    }
    const created: FakeCloudFrontTenant = {
      id: `dt-${++this.#next}`,
      distributionId: input.distributionId,
      name: input.name,
      hostname: input.hostname,
      enabled: true,
      disableDeployed: false,
      domainStatus: "inactive",
      certificateStatus: "pending-validation",
      issuedCertificateArn: null,
      attachedCertificateArn: null,
      etag: `etag-${++this.#next}`,
    };
    this.tenants.set(created.id, created);
    if (this.loseNextCreateAnswer) {
      this.loseNextCreateAnswer = false;
      throw cloudFrontError("TimeoutError");
    }
    return this.#view(created);
  }

  async get(identifier: string): Promise<CloudFrontTenant | null> {
    this.#record("get", { id: identifier });
    const tenant =
      this.tenants.get(identifier) ??
      [...this.tenants.values()].find((candidate) => candidate.name === identifier);
    return tenant ? this.#view(tenant) : null;
  }

  async certificate(id: string): Promise<CloudFrontCertificate | null> {
    this.#record("certificate", { id });
    const tenant = this.tenants.get(id);
    return tenant
      ? { status: tenant.certificateStatus, certificateArn: tenant.issuedCertificateArn }
      : null;
  }

  async attachCertificate(id: string, etag: string, certificateArn: string): Promise<void> {
    this.#record("attachCertificate", { id, etag, certificateArn });
    const tenant = this.#current(id, etag);
    tenant.attachedCertificateArn = certificateArn;
    tenant.etag = `etag-${++this.#next}`;
  }

  async disable(id: string, etag: string): Promise<string> {
    this.#record("disable", { id, etag });
    const tenant = this.#current(id, etag);
    tenant.enabled = false;
    tenant.etag = `etag-${++this.#next}`;
    return tenant.etag;
  }

  async remove(id: string, etag: string): Promise<void> {
    this.#record("remove", { id, etag });
    const tenant = this.#current(id, etag);
    if (tenant.enabled || !tenant.disableDeployed) throw cloudFrontError("ResourceNotDisabled");
    this.tenants.delete(id);
  }

  find(hostname: string): FakeCloudFrontTenant | undefined {
    return [...this.tenants.values()].find((tenant) => tenant.hostname === hostname);
  }

  set(
    hostname: string,
    update: Partial<Pick<FakeCloudFrontTenant, "domainStatus" | "certificateStatus">>,
  ): void {
    const found = this.find(hostname);
    if (!found) throw new Error(`no distribution tenant for ${hostname}`);
    Object.assign(found, update);
  }

  issueCertificate(hostname: string): void {
    const found = this.find(hostname);
    if (!found) throw new Error(`no distribution tenant for ${hostname}`);
    found.certificateStatus = "issued";
    found.issuedCertificateArn = `arn:aws:acm:us-east-1:000000000000:certificate/${found.id}`;
  }

  activate(hostname: string): void {
    this.issueCertificate(hostname);
    const found = this.find(hostname);
    if (!found) throw new Error(`no distribution tenant for ${hostname}`);
    found.attachedCertificateArn = found.issuedCertificateArn;
    found.domainStatus = "active";
  }

  deployDisable(hostname: string): void {
    const found = this.find(hostname);
    if (!found) throw new Error(`no distribution tenant for ${hostname}`);
    found.disableDeployed = true;
  }
}

/** An in-memory S3 for tests: objects by bucket and key; `calls` records every operation. */
export class FakeS3Api implements S3Api {
  readonly objects = new Map<string, { content: Uint8Array; contentType: string }>();
  readonly calls: string[] = [];

  private id(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  async getObject(bucket: string, key: string): Promise<Uint8Array | null> {
    this.calls.push(`get ${key}`);
    return this.objects.get(this.id(bucket, key))?.content ?? null;
  }

  async putObject(bucket: string, key: string, content: Uint8Array, contentType: string) {
    this.calls.push(`put ${key}`);
    this.objects.set(this.id(bucket, key), { content, contentType });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    this.calls.push(`delete ${key}`);
    this.objects.delete(this.id(bucket, key));
  }

  async deleteObjects(bucket: string, keys: readonly string[]): Promise<void> {
    this.calls.push(`deleteMany ${keys.length}`);
    for (const key of keys) this.objects.delete(this.id(bucket, key));
  }

  async listKeys(
    bucket: string,
    prefix: string,
    continuationToken?: string,
  ): Promise<{ keys: string[]; next: string | null }> {
    const all = [...this.objects.keys()]
      .filter((id) => id.startsWith(`${bucket}/${prefix}`))
      .map((id) => id.slice(bucket.length + 1))
      .sort();
    const start = continuationToken ? Number(continuationToken) : 0;
    const keys = all.slice(start, start + 2);
    return { keys, next: start + 2 < all.length ? String(start + 2) : null };
  }
}

/** An SES receipt notification (the SQS body, raw SNS delivery) for an S3-action receipt rule. */
export function sesReceiptNotification(input: {
  messageId: string;
  source: string;
  recipients: string[];
  bucketName: string;
  objectKey: string;
  verdicts?: Partial<Record<"spam" | "virus" | "spf" | "dkim" | "dmarc", string>>;
  dmarcPolicy?: string;
}): string {
  const verdict = (name: "spam" | "virus" | "spf" | "dkim" | "dmarc") => ({
    status: input.verdicts?.[name] ?? "PASS",
  });
  return JSON.stringify({
    notificationType: "Received",
    mail: {
      timestamp: "2026-10-12T10:00:00.000Z",
      source: input.source,
      messageId: input.messageId,
      destination: ["header-to@example.com"],
      headersTruncated: false,
    },
    receipt: {
      timestamp: "2026-10-12T10:00:00.000Z",
      processingTimeMillis: 420,
      recipients: input.recipients,
      spamVerdict: verdict("spam"),
      virusVerdict: verdict("virus"),
      spfVerdict: verdict("spf"),
      dkimVerdict: verdict("dkim"),
      dmarcVerdict: verdict("dmarc"),
      ...(input.dmarcPolicy ? { dmarcPolicy: input.dmarcPolicy } : {}),
      action: {
        type: "S3",
        topicArn: "arn:aws:sns:us-east-1:123456789012:coss-ses-inbound",
        bucketName: input.bucketName,
        objectKeyPrefix: "landing/",
        objectKey: input.objectKey,
      },
    },
  });
}
