import type { PlanGate, UsageGate } from "@coss/billing/gate";
import { pool } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import {
  createEmailService,
  DEVELOPMENT_LINK_KEYS,
  type DomainDeps,
  type EmailService,
  FakeEmailProvider,
  FakeIdentityProvider,
  FakeInboundStore,
  FakeTrackingHostnameProvider,
} from "@coss/email";
import type { InboundRuntime } from "@coss/email/runtime";
import type { SendEmailRequestInput } from "@coss/email/schemas";
import { createVerifiedDomain, memoryDispatchQueue } from "@coss/email/testing";
import type { FormFileStore } from "@coss/forms";
import type { LogEntryInput, LogWriter } from "@coss/logs";
import type { ClientIpResolver, RateLimiter } from "@coss/ratelimit";
import type { RiskDeps } from "@coss/risk";
import { testRiskDeps } from "@coss/risk/testing";
import { testSchedulingDeps } from "@coss/scheduling/testing";
import type { SignService } from "@coss/sign";
import { createSmsService, FakeSmsProvider, type SmsService } from "@coss/sms";
import { memorySmsDispatchQueue } from "@coss/sms/testing";
import type { ApiKeyContext } from "@coss/tenancy";
import { LATEST_API_VERSION, type Versioning } from "@coss/versioning";
import { decryptSecret } from "@coss/webhooks";
import { TEST_SECRETS_KEYS, testManagementDeps } from "@coss/webhooks/testing";
import { type CreateAppOptions, createApp } from "../src/app.ts";
import type { ErrorEnvelopeBody } from "../src/errors.ts";

export const REQUEST_ID = /^req_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

/** Origin of the tracking URLs `createTestApp` puts into emails (`app.request` ignores it). */
export const TRACKING_BASE_URL = "http://api.test";

/** The managed inbound domain of `createTestApp`'s receiving. */
export const TEST_INBOUND_DOMAIN = "inbound.coss.test";

/**
 * An app whose live and sandbox providers are separate, silent fakes. Sends only enqueue (in
 * memory): `dispatch()` runs the queued jobs, as the worker would. Domains verify without DNS and
 * webhook endpoints may use local `http://` URLs.
 */
export function createTestApp(
  opts: {
    emailService?: EmailService;
    smsService?: SmsService;
    /** Defaults to the fake document store; `null`: Sign unavailable. */
    signService?: SignService | null;
    signUrl?: string | null;
    /** Verify's shared numbers and coss.com's email sender (none by default). */
    verify?: CreateAppOptions["verify"];
    /** Defaults to the local API's origin and the fake file store. */
    forms?: { url?: string | null; store?: FormFileStore | null; hostOnly?: boolean };
    domainDeps?: DomainDeps;
    rateLimiter?: RateLimiter;
    clientIp?: ClientIpResolver;

    corsOrigins?: readonly string[];
    logWriter?: LogWriter;
    versioning?: Versioning;
    /** Defaults to the fake provider's receiving (managed domain `inbound.coss.test`). */
    inbound?: InboundRuntime | null;
    riskDeps?: RiskDeps;
    /** `null`: Scheduling is off, as in production without its key. */
    scheduling?: null;
    /** Enforce plans (`createPlanGate`) and Free's allowance (`createUsageGate`). Off by default. */
    plans?: PlanGate;
    billing?: UsageGate;
    shutdownSignal?: AbortSignal;
    /** Waiting listener polls check this often (default 20 ms, so tests don't wait). */
    listenerPollIntervalMs?: number;
  } = {},
) {
  const liveProvider = new FakeEmailProvider({ log: false });
  const sandboxProvider = new FakeEmailProvider({ log: false });
  const identity = new FakeIdentityProvider();
  const tracking = new FakeTrackingHostnameProvider({ cnameTarget: "track.coss.test" });
  const queue = memoryDispatchQueue();
  const inbound =
    opts.inbound === undefined
      ? {
          store: new FakeInboundStore(),
          managedDomain: TEST_INBOUND_DOMAIN,
          mxHost: "inbound-smtp.us-east-1.amazonaws.com",
        }
      : opts.inbound;
  const emailService =
    opts.emailService ??
    createEmailService({
      liveProvider,
      sandboxProvider,
      queue,
      trackingBaseUrl: TRACKING_BASE_URL,
      trackingDomainProvider: tracking.name,
      billing: opts.billing,
      linkKeys: DEVELOPMENT_LINK_KEYS,
    });
  const smsProvider = new FakeSmsProvider({ log: false });
  const smsQueue = memorySmsDispatchQueue();
  const smsService =
    opts.smsService ??
    createSmsService({
      liveProvider: smsProvider,
      sandboxProvider: smsProvider,
      queue: smsQueue,
      billing: opts.billing,
    });
  const app = createApp({
    emailService,
    smsService,
    signService: opts.signService,
    signUrl: opts.signUrl,
    verify: opts.verify,
    forms: opts.forms,
    domainDeps: opts.domainDeps ?? { identity, dns: null, tracking, plans: opts.plans },
    inbound,
    webhookDeps: { ...testManagementDeps, plans: opts.plans },
    links: { keys: DEVELOPMENT_LINK_KEYS, baseUrl: TRACKING_BASE_URL },
    plans: opts.plans,
    billing: opts.billing,
    riskDeps: opts.riskDeps ?? testRiskDeps(),
    scheduling: opts.scheduling === null ? null : testSchedulingDeps(),
    rateLimiter: opts.rateLimiter,
    clientIp: opts.clientIp,

    corsOrigins: opts.corsOrigins,
    logWriter: opts.logWriter,
    versioning: opts.versioning,
    shutdownSignal: opts.shutdownSignal,
    listenerPollIntervalMs: opts.listenerPollIntervalMs ?? 20,
  });
  const dispatch = () => queue.drain(emailService);
  const dispatchSms = () => smsQueue.drain(smsService);
  return {
    app,
    emailService,
    liveProvider,
    sandboxProvider,
    identity,
    tracking,
    queue,
    dispatch,
    inbound,
    smsProvider,
    smsQueue,
    dispatchSms,
  };
}

export type TestApp = ReturnType<typeof createTestApp>["app"];

export function emailBody(overrides: Partial<SendEmailRequestInput> = {}): SendEmailRequestInput {
  return {
    from: "Acme <hello@acme.com>",
    to: "user@example.com",
    subject: "Welcome",
    text: "Hello!",
    ...overrides,
  };
}

/** A From address on a new verified domain of the organization, as live keys require. */
export async function domainFrom(organizationId: string): Promise<string> {
  const domain = await createVerifiedDomain(organizationId);
  return `Acme <hello@${domain.name}>`;
}

export function sendEmail(
  app: TestApp,
  key: string | null,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request("/v1/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/**
 * A request to the API with an API key (`key: null` sends none). Bodies are JSON; a string body
 * is sent verbatim, so tests can post malformed JSON.
 */
export function apiRequest(
  app: TestApp,
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  opts: { key?: string | null; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const key = opts.key ?? null;
  return Promise.resolve(
    app.request(path, {
      method,
      headers: {
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
        ...(key === null ? {} : { Authorization: `Bearer ${key}` }),
        ...opts.headers,
      },
      ...(opts.body !== undefined && {
        body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
      }),
    }),
  );
}

/** A domain name no other test uses (tests never truncate). */
export function uniqueDomainName(): string {
  return `t-${uniqueSuffix()}.coss.test`;
}

export function getEmailById(app: TestApp, key: string, id: string): Promise<Response> {
  return Promise.resolve(
    app.request(`/v1/emails/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    }),
  );
}

/** Parses an error response and checks the invariants every error envelope shares. */
export async function errorOf(response: Response): Promise<ErrorEnvelopeBody["error"]> {
  const requestId = response.headers.get("x-request-id");
  if (!requestId || !REQUEST_ID.test(requestId)) {
    throw new Error(`missing or malformed X-Request-Id: ${requestId}`);
  }
  const body = (await response.json()) as ErrorEnvelopeBody;
  if (body.error.request_id !== requestId) {
    throw new Error(`envelope request_id ${body.error.request_id} !== header ${requestId}`);
  }
  return body.error;
}

// apps/api does not depend on drizzle-orm, so fixtures are adjusted with parameterized SQL on the
// same pool Drizzle uses.

export async function apiKeyIdForEnvironment(environmentId: string): Promise<string> {
  const { rows } = await pool.query<{ api_key_id: string }>(
    "select api_key_id from environment_api_key where environment_id = $1",
    [environmentId],
  );
  if (rows.length !== 1 || !rows[0]) {
    throw new Error(`expected exactly one key bound to ${environmentId}, got ${rows.length}`);
  }
  return rows[0].api_key_id;
}

/** Makes the key a restricted one holding exactly `permissions`. */
export async function setKeyPermissions(
  apiKeyId: string,
  permissions: Record<string, string[]>,
): Promise<void> {
  await pool.query("update apikey set permissions = $1 where id = $2", [
    JSON.stringify(permissions),
    apiKeyId,
  ]);
  await pool.query("update environment_api_key set access = 'restricted' where api_key_id = $1", [
    apiKeyId,
  ]);
}

export async function setKeyEnabled(apiKeyId: string, enabled: boolean): Promise<void> {
  await pool.query("update apikey set enabled = $1 where id = $2", [enabled, apiKeyId]);
}

export async function deleteKey(apiKeyId: string): Promise<void> {
  await pool.query("delete from apikey where id = $1", [apiKeyId]);
}

/** A webhook endpoint as stored, including the signing secret the API only returns on create. */
export async function endpointRow(id: string): Promise<{
  url: string;
  description: string | null;
  eventTypes: string[];
  enabled: boolean;
  secret: string;
}> {
  const { rows } = await pool.query<{
    url: string;
    description: string | null;
    event_types: string[];
    enabled: boolean;
    secret_ciphertext: string;
  }>(
    "select url, description, event_types, enabled, secret_ciphertext from webhook_endpoint where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`no webhook endpoint ${id}`);
  return {
    url: row.url,
    description: row.description,
    eventTypes: row.event_types,
    enabled: row.enabled,
    secret: decryptSecret(row.secret_ciphertext, TEST_SECRETS_KEYS),
  };
}

/** Backdates a domain's verification window, so the next check gives up on it. */
export async function expireDomainVerification(domainId: string): Promise<void> {
  await pool.query(
    "update domain set verification_started_at = now() - interval '80 hours' where id = $1",
    [domainId],
  );
}

export function authContext(overrides: Partial<ApiKeyContext> = {}): ApiKeyContext {
  return {
    apiKeyId: "key_00000000000000000000000000",
    organizationId: "org_00000000000000000000000000",
    projectId: "proj_00000000000000000000000000",
    environmentId: "env_00000000000000000000000000",
    ownerUserId: null,
    mode: "sandbox",
    hipaaMode: false,
    apiVersion: LATEST_API_VERSION,
    ...overrides,
  };
}

/** Waits until the (asynchronous) request log has written `count` lines. */
export async function waitForLogLines(
  writer: { entries: LogEntryInput[] },
  count: number,
): Promise<LogEntryInput[]> {
  for (let i = 0; i < 100 && writer.entries.length < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return writer.entries;
}
