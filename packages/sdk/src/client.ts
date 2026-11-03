import { API_VERSION, type ApiVersion } from "./api-version.ts";
import { type CossResult, clientError } from "./core/errors.ts";
import { type FetchLike, HttpClient, type RequestOptions } from "./core/http.ts";
import { loadOpenTelemetry } from "./core/tracing.ts";
import { ApiKeyResource } from "./resources/api-key.ts";
import { AuditEventsResource } from "./resources/audit-events.ts";
import { BillingResource } from "./resources/billing.ts";
import { DomainsResource } from "./resources/domains.ts";
import { EmailResource } from "./resources/email.ts";
import { EnvironmentResource } from "./resources/environment.ts";
import { FormsResource } from "./resources/forms.ts";
import { HooksResource } from "./resources/hooks.ts";
import { InboxesResource } from "./resources/inboxes.ts";
import { listQuery } from "./resources/list-query.ts";
import { LogDrainsResource } from "./resources/log-drains.ts";
import { LogsResource } from "./resources/logs.ts";
import { ReputationResource } from "./resources/reputation.ts";
import { RiskResource } from "./resources/risk.ts";
import { SchedulingResource } from "./resources/scheduling.ts";
import { SignResource } from "./resources/sign.ts";
import { SmsResource } from "./resources/sms.ts";
import { VerifyResource } from "./resources/verify.ts";
import { WebhookEndpointsResource } from "./resources/webhook-endpoints.ts";
import { WebhookEventsResource } from "./resources/webhook-events.ts";
import { WebhookListenersResource } from "./resources/webhook-listeners.ts";

export interface CossOptions {
  /** Secret API key (`coss_live_…` or `coss_test_…`). Defaults to the `COSS_API_KEY` env variable. */
  apiKey?: string;
  /** Defaults to the `COSS_BASE_URL` env variable, then `https://api.coss.com`. */
  baseUrl?: string;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Per-attempt timeout in milliseconds. Default `30000`. */
  timeout?: number;
  /** Retries for connection errors, timeouts, 409, 429 and 5xx. Default `2`; excludes webhook creation. */
  maxRetries?: number;
  /**
   * The API version (`Coss-Version`) to request. Defaults to `API_VERSION`, the version this SDK's
   * types describe; requests never fall back to your organization's pinned version.
   */
  apiVersion?: ApiVersion;
  /**
   * Allow use where a `document` global exists. Off by default because shipping a secret API key
   * to a browser exposes it to anyone who opens the page.
   */
  dangerouslyAllowBrowser?: boolean;
  /**
   * OpenTelemetry. Default `true`: when `@opentelemetry/api` is installed, every call gets a client
   * span and sends its context as `traceparent`, which the API stores on the emails and text
   * messages the call sends and echoes in their log lines and webhooks (`data.traceparent`, and the
   * webhook request's `traceparent` header). `false`: no spans, no trace headers.
   */
  tracing?: boolean;
}

export type CossRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Options of `coss.request()`. */
export interface CossRequestOptions extends RequestOptions {
  /** Query parameters: lists are comma-joined, dates ISO 8601, `undefined` values left out. */
  query?: Record<
    string,
    string | number | boolean | Date | readonly (string | number)[] | undefined
  >;
  /** Sent as JSON. */
  body?: unknown;
  /**
   * `text` or `bytes` for a successful response that isn't JSON (a CSV export, a received email's
   * raw message, an attachment). Default `json`.
   */
  responseType?: "json" | "text" | "bytes";
  /**
   * Automatic retries (as `maxRetries` says). Default: on for GET and DELETE; off for POST, PUT and
   * PATCH, since not every endpoint deduplicates them (a template draft's save, a PUT, counts every
   * attempt as a revision).
   */
  retry?: boolean;
}

/**
 * @internal Names the integration (`coss/nodemailer`, …) that created a client, for its
 * `User-Agent`. A symbol rather than a `CossOptions` field so it stays out of the public options.
 */
export const INTEGRATION: unique symbol = Symbol("coss.integration");

const DEFAULT_BASE_URL = "https://api.coss.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
// Timers overflow (and fire immediately) above 2^31-1 ms.
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Reads an env variable where one exists (Node, Bun, Deno's `process`), never throwing. */
function readEnv(name: string): string | undefined {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    return env?.[name]?.trim() || undefined;
  } catch {
    // e.g. Deno without --allow-env
    return undefined;
  }
}

// Invalid numbers fall back to the defaults: the constructor only throws for missing credentials.
function retries(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : DEFAULT_MAX_RETRIES;
}

function timeoutMs(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(Math.ceil(value), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
}

/**
 * The coss.com client. One API key covers every product.
 *
 * ```ts
 * const coss = new Coss({ apiKey: "coss_test_…" });
 * const { data, error } = await coss.email.send({ from, to, subject, html });
 * ```
 */
export class Coss {
  readonly email: EmailResource;
  /** Text messages from the organization's numbers (`coss.sms.send()`). */
  readonly sms: SmsResource;
  /** E-signatures: documents and signature requests (`coss.sign.requests.create()`). */
  readonly sign: SignResource;
  /** Email addresses for agents, with threads and replies (`coss.inboxes.create()`). */
  readonly inboxes: InboxesResource;
  /** One-time codes by SMS or email (`coss.verify.start()`, `coss.verify.check()`). */
  readonly verify: VerifyResource;
  /** Hosted form endpoints and their submissions (`coss.forms.create()`). */
  readonly forms: FormsResource;
  /** Availability and bookings (`coss.scheduling.bookings.create()`). */
  readonly scheduling: SchedulingResource;
  /** The API key's environment, project and organization (`coss.environment.get()`). */
  readonly environment: EnvironmentResource;
  /** The client's own API key (`coss.apiKey.revoke()`). */
  readonly apiKey: ApiKeyResource;
  /** Sending domains of the organization (`coss.domains.create`, `.verify`, …). */
  readonly domains: DomainsResource;
  /** Webhook endpoints of the API key's environment. */
  readonly webhookEndpoints: WebhookEndpointsResource;
  /** Temporary listeners `coss listen` pulls the environment's events from. */
  readonly webhookListeners: WebhookListenersResource;
  /** Test events for the environment's endpoints and listeners (`coss.webhookEvents.test()`). */
  readonly webhookEvents: WebhookEventsResource;
  /** The organization's sending reputation (`coss.reputation.get()`). */
  readonly reputation: ReputationResource;
  /** The environment's log: API requests, email events, webhook attempts (`coss.logs.list()`). */
  readonly logs: LogsResource;
  /** HTTPS endpoints the environment's log is streamed to (`coss.logDrains.create()`). */
  readonly logDrains: LogDrainsResource;
  /** The organization's audit log: changes by members, API keys and coss.com support (`coss.auditEvents.list()`). */
  readonly auditEvents: AuditEventsResource;
  /** Hooks, webhooks as a service: `coss.hooks.messages.send()` delivers to your users' endpoints. */
  readonly hooks: HooksResource;
  /** Risk assessments of sign-ups, logins and other events (`coss.risk.assess()`). */
  readonly risk: RiskResource;
  /** The organization's plan, usage, invoices and credits (`coss.billing.get()`). */
  readonly billing: BillingResource;
  readonly #http: HttpClient;

  /**
   * Throws only for programmer errors: no API key, or running in a browser without
   * `dangerouslyAllowBrowser`. Request failures are returned as `{ data: null, error }`.
   */
  constructor(options: CossOptions = {}) {
    if (
      typeof (globalThis as { document?: unknown }).document !== "undefined" &&
      !options.dangerouslyAllowBrowser
    ) {
      throw new Error(
        "Refusing to create a coss.com client in a browser-like environment: coss.com API keys are secret, " +
          "and any key sent to the browser can be read by anyone using the page. Call coss.com from your " +
          "server instead, or pass `dangerouslyAllowBrowser: true` if you understand the risk.",
      );
    }

    const apiKey = options.apiKey?.trim() || readEnv("COSS_API_KEY");
    if (!apiKey) {
      throw new Error(
        "Missing coss.com API key. Pass `apiKey` to `new Coss({ apiKey })` or set the COSS_API_KEY " +
          "environment variable.",
      );
    }

    const http = new HttpClient({
      apiKey,
      baseUrl: options.baseUrl?.trim() || readEnv("COSS_BASE_URL") || DEFAULT_BASE_URL,
      // Called through globalThis: a detached `fetch` throws "Illegal invocation" in browsers/Workers.
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      timeout: timeoutMs(options.timeout),
      maxRetries: retries(options.maxRetries),
      apiVersion: options.apiVersion?.trim() || API_VERSION,
      integration: (options as { [INTEGRATION]?: string })[INTEGRATION],
      tracing: options.tracing === false ? null : loadOpenTelemetry,
    });
    this.#http = http;
    this.email = new EmailResource(http);
    this.environment = new EnvironmentResource(http);
    this.apiKey = new ApiKeyResource(http);
    this.domains = new DomainsResource(http);
    this.webhookEndpoints = new WebhookEndpointsResource(http);
    this.webhookListeners = new WebhookListenersResource(http);
    this.webhookEvents = new WebhookEventsResource(http);
    this.reputation = new ReputationResource(http);
    this.logs = new LogsResource(http);
    this.logDrains = new LogDrainsResource(http);
    this.auditEvents = new AuditEventsResource(http);
    this.hooks = new HooksResource(http);
    this.risk = new RiskResource(http);
    this.billing = new BillingResource(http);
    this.sms = new SmsResource(http);
    this.sign = new SignResource(http);
    this.inboxes = new InboxesResource(http);
    this.verify = new VerifyResource(http);
    this.forms = new FormsResource(http);
    this.scheduling = new SchedulingResource(http);
  }

  /**
   * Calls any endpoint, for one this SDK has no method for yet. `path` starts with `/v1/` (a query
   * string is merged with `query`); the result is the response's JSON, unchecked.
   *
   * ```ts
   * const { data, error } = await coss.request("GET", "/v1/domains", { query: { limit: 5 } });
   * ```
   */
  request<T = unknown>(
    method: CossRequestMethod,
    path: string,
    options: CossRequestOptions = {},
  ): Promise<CossResult<T>> {
    // Appended to the base URL as is: anything but a path could change the host the key goes to.
    if (!path.startsWith("/")) {
      const message = `The path must start with "/", e.g. "/v1/domains"; got "${path}".`;
      return Promise.resolve({
        data: null,
        error: clientError("invalid_request_error", "invalid_path", message),
      });
    }
    const index = path.indexOf("?");
    const query: Record<string, string | undefined> = {};
    if (index >= 0) {
      for (const [name, value] of new URLSearchParams(path.slice(index + 1))) query[name] = value;
    }
    Object.assign(query, listQuery(options.query ?? {}));
    return this.#http.request<T>({
      method,
      path: index >= 0 ? path.slice(0, index) : path,
      query,
      body: options.body,
      responseType: options.responseType,
      retry: options.retry ?? (method === "GET" || method === "DELETE"),
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
  }
}
