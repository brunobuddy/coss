import type { PlanGate, UsageGate } from "@coss/billing/gate";
import { db } from "@coss/db";
import {
  authorizeLiveSender,
  type DomainDeps,
  type EmailService,
  type LinkKeyRing,
} from "@coss/email";
import type { InboundRuntime } from "@coss/email/runtime";
import { FakeFormFileStore, type FormFileStore, hostedPageScreening } from "@coss/forms";
import { type LogWriter, noopLogWriter } from "@coss/logs";
import {
  type ClientIpResolver,
  createRateLimiter,
  MemoryStore,
  type RateLimiter,
} from "@coss/ratelimit";
import { DEVELOPMENT_HASH_KEY, type RiskDeps } from "@coss/risk";
import type { SchedulingDeps } from "@coss/scheduling";
import { createSignService, FakeDocumentStore, type SignService } from "@coss/sign";
import type { SmsService } from "@coss/sms";
import { createVerifyService, type SharedSmsSender, verifyCodeKey } from "@coss/verify";
import { versioning as apiVersioning, type Versioning } from "@coss/versioning";
import type { WebhookManagementDeps } from "@coss/webhooks";
import { OpenAPIHono } from "@hono/zod-openapi";
import { honoMiddleware } from "@sentry/bun";
import type { HostedMcp } from "coss-mcp/http";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { BODY_LIMIT_BYTES, hasOwnBodyLimit, limitBody, MCP_PATH } from "./body-limit.ts";
import { errorResponse, internalError, notFound, toApiError } from "./errors.ts";
import { accessLog } from "./middleware/access-log.ts";
import { apiVersion } from "./middleware/api-version.ts";
import { requestId } from "./middleware/request-id.ts";
import { requestLog } from "./middleware/request-log.ts";
import { traceContext } from "./middleware/trace-context.ts";
import { withApiVersionDocs } from "./openapi-versions.ts";
import { createFormEndpointRoutes, FORMS_PATH_PREFIX } from "./routes/forms-public.ts";
import { createMcpRoutes } from "./routes/mcp.ts";
import { createPreferenceRoutes } from "./routes/preferences.ts";
import {
  createSchedulingCallbackRoutes,
  SCHEDULING_CALLBACK_PATH,
} from "./routes/scheduling-callbacks.ts";
import {
  createSchedulingClientRoutes,
  SCHEDULING_CLIENT_PATH,
} from "./routes/scheduling-client.ts";
import { createSmsCallbackRoutes, SMS_CALLBACK_PATH } from "./routes/sms-callbacks.ts";
import { createTrackingRoutes, TRACKING_PATH_PREFIX } from "./routes/tracking.ts";
import { createV1Router } from "./routes/v1.ts";
import { createDefaultEmailRuntime } from "./runtime.ts";
import type { AppEnv } from "./types.ts";
import { validationHook } from "./validation.ts";
import { type CossVerifySender, verifyEmailSender } from "./verify-email.ts";
import { registerWebhookEvents } from "./webhook-events.ts";

export type CreateAppOptions = {
  /** Sends store the email and enqueue its dispatch (`createEmailService`). */
  emailService: EmailService;
  /** Sends store the SMS and enqueue its dispatch (`createSmsService`). */
  smsService: SmsService;
  /**
   * Sign's documents (`createSignService` over the deployment's document store). Defaults to the
   * fake store (Postgres rows); `null` turns uploads and new requests off (`sign_unavailable`).
   */
  signService?: SignService | null;
  /**
   * Verify: the code key (`verifyCodeKey` of `RISK_HASH_KEY`; defaults to the development key's),
   * coss.com's shared numbers (`VERIFY_SMS_*`; none by default: live SMS codes need the
   * environment's own number) and coss.com's email sender (`NOTIFICATIONS_*`; none by default).
   */
  verify?: {
    codeKey?: Uint8Array;
    sharedSms?: SharedSmsSender | null;
    cossEmail?: CossVerifySender | null;
  };
  /**
   * Scheduling's attendee data key ring and lookup key (`SCHEDULING_DATA_KEYS`, `RISK_HASH_KEY`).
   * Required, as a throwaway key would make every stored attendee unreadable; `null` turns the
   * product off (`scheduling_unavailable`), as production does until it's configured.
   */
  scheduling: SchedulingDeps | null;
  /** Identity provider and DNS resolver for domain management. Defaults to the fake provider. */
  domainDeps?: DomainDeps;
  /**
   * Receiving (`EmailRuntime.inbound`): the content store and managed domain. Defaults to the
   * fake provider's; `null` turns the receiving endpoints off (`receiving_unavailable`).
   */
  inbound?: InboundRuntime | null;
  /**
   * Encrypts webhook endpoint signing secrets (`WEBHOOK_SECRETS_KEY`). Required: a throwaway key
   * would silently make the endpoints it creates undeliverable.
   */
  webhookDeps: WebhookManagementDeps;
  /**
   * Risk assessments: the identifier hasher (`RISK_HASH_KEY`), IP datasets, velocity counters and
   * DNS. Required for the same reason: a throwaway hash key would silently reset what each
   * environment remembers.
   */
  riskDeps: RiskDeps;
  /**
   * Marketing email's links (preference center, unsubscribe, double opt-in): the key ring
   * (`EMAIL_LINK_KEYS`) and the origin they point at (`TRACKING_PUBLIC_URL`, else the request's).
   * Required for the same reason: links minted with another key never open.
   */
  links: { keys: LinkKeyRing; baseUrl?: string };
  /**
   * Public origin advertised in the OpenAPI document (`API_PUBLIC_URL`).
   */
  publicUrl?: string;
  /**
   * Where Hooks portal session links point (`PORTAL_PUBLIC_URL`). Defaults to the local portal;
   * `null` (not deployed) makes creating a portal session fail with 503.
   */
  portalUrl?: string | null;
  /**
   * Where Sign's signing session links point (`SIGN_PUBLIC_URL`). Defaults to the local signing
   * app; `null` (not deployed) makes creating a signing session fail with 503.
   */
  signUrl?: string | null;
  /**
   * Forms: where they are served (`FORMS_PUBLIC_URL`; default the local API, `null` turns new
   * forms and the public endpoint off) and the uploads' store (default the fake store, `null`
   * refuses files). `hostOnly` (production) serves `/f/*` only on that URL's host.
   */
  forms?: { url?: string | null; store?: FormFileStore | null; hostOnly?: boolean };
  /** Defaults to in-memory counters (one per app), which only suit tests and a single process. */
  rateLimiter?: RateLimiter;
  /** Plan features and limits (`createPlanGate` from `@coss/billing`). Defaults to none (no limits). */
  plans?: PlanGate;
  /**
   * Hard usage caps (`createUsageGate`): what a new live inbox reserves, and what a canceled or
   * paused broadcast gives back of its reservation (also the default Sign service's). Must match
   * the email service's. Defaults to none.
   */
  billing?: UsageGate;
  /** The caller's address for per-IP limits (`CLIENT_IP_HEADER`). Defaults to none. */
  clientIp?: ClientIpResolver;

  /**
   * Browser origins allowed to call `/v1/*` (`API_CORS_ORIGINS`): the docs' API playground. None by
   * default. Never with credentials: the API authenticates with bearer keys only, never cookies.
   */
  corsOrigins?: readonly string[];
  /**
   * Receives an `api.request` log line per attributable `/v1` request (`createLogWriter`, which
   * buffers and fails open). Defaults to writing nothing.
   */
  logWriter?: LogWriter;
  /** The API's versions (`@coss/versioning`). Tests inject `testVersioning()`. */
  versioning?: Versioning;
  /**
   * Aborted when the server starts shutting down, so long polls (`coss listen`) answer at once and
   * the drain doesn't wait for them. Defaults to never.
   */
  shutdownSignal?: AbortSignal;
  /** How often a waiting listener poll checks for deliveries (tests shorten it). Default 1 s. */
  listenerPollIntervalMs?: number;
  /**
   * The hosted MCP server (`createHostedMcp` from `coss-mcp/http`, which is built output, so only
   * `src/index.ts` and the tests that need it import it). Not given: `/mcp` isn't served.
   */
  mcp?: HostedMcp;
};

/** Request headers a browser may send, and response headers it may read, cross-origin. */
// `traceparent` and `tracestate` (W3C Trace Context): a browser's tracing adds them to every fetch,
// and a preflight refusing them would block the request. Only `traceparent` is read.
const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "Coss-Version",
  "traceparent",
  "tracestate",
];
const CORS_EXPOSE_HEADERS = ["X-Request-Id", "Idempotent-Replayed", "Retry-After", "Coss-Version"];

/**
 * Builds the public API. Free of side effects (no env validation, no server), so tests can
 * create as many instances as they need and call `app.request()`.
 */
const READINESS_TIMEOUT_MS = 3000;

export function createApp(opts: CreateAppOptions) {
  const { emailService } = opts;
  // Cheap (in-memory fakes), and only used when no domain or inbound dependencies were injected.
  const defaults =
    opts.domainDeps === undefined || opts.inbound === undefined
      ? createDefaultEmailRuntime()
      : null;
  const domainDeps = opts.domainDeps ?? defaults?.domainDeps;
  const inbound = opts.inbound === undefined ? (defaults?.inbound ?? null) : opts.inbound;
  if (!domainDeps) throw new Error("createApp: no domain dependencies.");
  const rateLimiter = opts.rateLimiter ?? createRateLimiter({ store: new MemoryStore() });
  const clientIp = opts.clientIp ?? (() => null);
  const versioning = opts.versioning ?? apiVersioning;
  const formsUrl = opts.forms?.url === undefined ? "http://localhost:3001" : opts.forms.url;
  const formsStore = opts.forms?.store === undefined ? new FakeFormFileStore() : opts.forms.store;
  // Sub-routers inherit this hook: every validation failure becomes the 422 envelope.
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
  // The hosted MCP server's own API calls run here without a socket: whose address they are can't
  // come from a header, and nothing from outside can reach this map.
  const inProcessClientIps = new WeakMap<Request, { ip: string | null }>();

  // Sentry (when src/instrument.ts initialized it): names each request's transaction after its
  // route (`GET /v1/emails/:id`) and traces middleware. Unhandled errors are reported by the
  // console.error in onError (captureConsoleIntegration), so the middleware reports none itself.
  app.use(honoMiddleware(app, { shouldHandleError: () => false }));
  app.use(requestId);
  // Wraps everything after it, so it sees the final response (errors and 404s included).
  app.use(requestLog(opts.logWriter ?? noopLogWriter));
  app.use(async (c, next) => {
    c.set("rateLimiter", rateLimiter);
    c.set("plans", opts.plans ?? null);
    const inProcess = inProcessClientIps.get(c.req.raw);
    c.set("clientIp", inProcess ? inProcess.ip : clientIp(c.req.raw.headers));
    c.set("versioning", versioning);
    await next();
  });

  // Before everything else that can answer, so preflights and error responses carry the headers.
  app.use(
    "/v1/*",
    cors({
      origin: [...(opts.corsOrigins ?? [])],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowHeaders: CORS_ALLOW_HEADERS,
      exposeHeaders: CORS_EXPOSE_HEADERS,
      maxAge: 600,
      credentials: false,
    }),
  );
  app.use("/v1/*", apiVersion);
  app.use("/v1/*", traceContext);
  const strictHeaders = secureHeaders();
  // Mail clients and webmail load the open pixel from other origins.
  const trackingHeaders = secureHeaders({ crossOriginResourcePolicy: "cross-origin" });
  // Customers' sites read forms' JSON answers (CORS) and frame hosted pages their CSP allows; the
  // pages set their own referrer policy (a hosted page must keep its origin on its posts).
  const formHeaders = secureHeaders({
    crossOriginResourcePolicy: "cross-origin",
    xFrameOptions: false,
    referrerPolicy: false,
  });
  app.use((c, next) =>
    (c.req.path.startsWith(TRACKING_PATH_PREFIX)
      ? trackingHeaders
      : c.req.path.startsWith(FORMS_PATH_PREFIX) || c.req.path.startsWith(SCHEDULING_CLIENT_PATH)
        ? formHeaders
        : strictHeaders)(c, next),
  );
  const defaultBodyLimit = limitBody(BODY_LIMIT_BYTES);
  app.use((c, next) => (hasOwnBodyLimit(c) ? next() : defaultBodyLimit(c, next)));
  if (process.env.NODE_ENV !== "test") app.use(accessLog);

  app.onError((error, c) => {
    const apiError = toApiError(error);
    if (apiError) return errorResponse(c, apiError);
    console.error(
      `[api] Unhandled error (request_id=${c.var.requestId}) on ${c.req.method} ${c.req.path}:`,
      error,
    );
    return errorResponse(c, internalError());
  });

  app.notFound((c) =>
    errorResponse(c, notFound(`No endpoint matches ${c.req.method} ${c.req.path}.`)),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  // For uptime monitors only: load balancer health checks stay on `/health`, so a database outage
  // never takes every task out of service.
  app.get("/health/ready", async (c) => {
    const ready = await Promise.race([
      db.execute("select 1").then(
        () => true,
        () => false,
      ),
      Bun.sleep(READINESS_TIMEOUT_MS).then(() => false),
    ]);
    return c.json({ ok: ready }, ready ? 200 : 503);
  });

  // Public and unauthenticated (fetched by mail clients); not part of the OpenAPI document. The
  // preference center first: `/t` would otherwise answer its paths with a 404.
  app.route("/t/u", createPreferenceRoutes(opts.links.keys));
  app.route("/t", createTrackingRoutes());
  // Twilio's status and inbound callbacks, verified with the subaccount's (encrypted) token.
  app.route(
    SMS_CALLBACK_PATH,
    createSmsCallbackRoutes({ keys: opts.webhookDeps.secretsKeys, publicUrl: opts.publicUrl }),
  );

  // Google's and Microsoft's calendars: consent coming back, and push notifications.
  if (opts.scheduling?.calendars) {
    app.route(
      SCHEDULING_CALLBACK_PATH,
      createSchedulingCallbackRoutes({ calendars: opts.scheduling.calendars }),
    );
  }

  // What browsers call with a session: the hosted pages, and customers' own UIs.
  if (opts.scheduling) {
    app.route(
      SCHEDULING_CLIENT_PATH,
      createSchedulingClientRoutes({
        deps: { ...opts.scheduling, billing: opts.billing, plans: opts.plans },
        hostedUrl: opts.scheduling.publicUrl ?? null,
      }),
    );
  }

  // Forms' public endpoint, where customers' sites post (its own host in production).
  if (formsUrl) {
    app.route(
      "/f",
      createFormEndpointRoutes({
        riskDeps: opts.riskDeps,
        store: formsStore,
        links: { publicUrl: formsUrl },
        hostOnly: opts.forms?.hostOnly ? new URL(formsUrl).host.toLowerCase() : null,
        billing: opts.billing,
      }),
    );
  }

  // Streamable HTTP, for MCP clients that can't start a local process. Not in the OpenAPI document.
  if (opts.mcp) {
    app.route(
      MCP_PATH,
      createMcpRoutes({
        mcp: opts.mcp,
        shutdownSignal: opts.shutdownSignal ?? new AbortController().signal,
        apiFetch: (request, callerIp) => {
          inProcessClientIps.set(request, { ip: callerIp });
          return app.fetch(request);
        },
      }),
    );
  }

  app.route(
    "/v1",
    createV1Router({
      emailService,
      smsService: opts.smsService,
      verifyService: createVerifyService({
        risk: opts.riskDeps,
        codeKey: opts.verify?.codeKey ?? verifyCodeKey(DEVELOPMENT_HASH_KEY),
        sms: opts.smsService,
        sharedSms: opts.verify?.sharedSms ?? null,
        sendEmail: verifyEmailSender({
          service: emailService,
          coss: opts.verify?.cossEmail ?? null,
        }),
        billing: opts.billing,
        limiter: rateLimiter,
      }),
      signService:
        opts.signService === undefined
          ? createSignService({ store: new FakeDocumentStore(), billing: opts.billing })
          : opts.signService,
      domainDeps,
      webhookDeps: opts.webhookDeps,
      portalUrl: opts.portalUrl === undefined ? "http://localhost:3003" : opts.portalUrl,
      signUrl: opts.signUrl === undefined ? "http://localhost:3004" : opts.signUrl,
      formsUrl,
      formsStore,
      scheduling: opts.scheduling && {
        ...opts.scheduling,
        billing: opts.billing,
        plans: opts.plans,
        screenSetup: opts.scheduling.screenSetup ?? hostedPageScreening(opts.riskDeps),
        verifiedAddress:
          opts.scheduling.verifiedAddress ??
          (async ({ organizationId, address }) => {
            try {
              await authorizeLiveSender({
                organizationId,
                from: address,
                provider: domainDeps.identity.name,
              });
              return true;
            } catch {
              return false;
            }
          }),
      },
      riskDeps: opts.riskDeps,
      inbound,
      shutdownSignal: opts.shutdownSignal ?? new AbortController().signal,
      listenerPollIntervalMs: opts.listenerPollIntervalMs,
      links: opts.links,
      billing: opts.billing,
    }),
  );

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description:
      "A secret API key from the dashboard: `coss_live_…` for production environments, " +
      "`coss_test_…` for sandbox environments.",
  });
  registerWebhookEvents(app);

  // The origin this document was served from, so local and deployed copies both work.
  // Request origin is a dev/test fallback only: it is Host-header controlled and loses https
  // behind TLS-terminating proxies.
  app.get("/openapi.json", (c) =>
    c.json(renderOpenApiDocument(app, opts.publicUrl ?? new URL(c.req.url).origin, versioning)),
  );

  return app;
}

/** The OpenAPI document: the routes', plus what isn't derived from them (the `Coss-Version` header). */
export function renderOpenApiDocument(
  app: OpenAPIHono<AppEnv>,
  serverUrl: string,
  versioning: Versioning = apiVersioning,
) {
  return withApiVersionDocs(app.getOpenAPI31Document(openApiDocumentConfig(serverUrl)), versioning);
}

/** Everything in the OpenAPI document that isn't derived from the routes. */
export function openApiDocumentConfig(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "coss.com API",
      // Replaced by the latest `Coss-Version` (`withApiVersionDocs`).
      version: "v1",
      description:
        "One API key for every coss.com product. Errors share one envelope: `Error`. Every request " +
        "is scoped to the environment the key belongs to; domains and the audit log are " +
        "organization-wide.",
    },
    servers: [{ url: serverUrl }],
    tags: [
      {
        name: "Environment",
        description: "The environment, project and organization an API key belongs to.",
      },
      { name: "Emails", description: "Send transactional email and follow its delivery." },
      {
        name: "Email templates",
        description:
          "Versioned, localized subjects and bodies with typed variables, sent by id or alias.",
      },
      {
        name: "Suppressions",
        description: "Addresses that sends skip, added by bounces, complaints or you.",
      },
      {
        name: "Sub-accounts",
        description:
          "Your users, each with their own domains, suppressions, quotas and reputation (email for platforms).",
      },
      {
        name: "Tracking",
        description: "Which emails of the environment have their opens and clicks tracked.",
      },
      {
        name: "SMS",
        description:
          "Send text messages from the organization's numbers, follow their delivery, and read replies and opt-outs.",
      },
      {
        name: "Signature requests",
        description:
          "Ask people to sign PDFs, in your app or by email, with an audit trail and a sealed copy.",
      },
      {
        name: "Sign documents",
        description: "PDFs uploaded for signature requests, with their pages and text anchors.",
      },
      {
        name: "Sign templates",
        description:
          "Reusable documents with fields for roles, made into requests, edited in the embedded builder.",
      },
      {
        name: "Sign settings",
        description:
          "Which sites may embed the signing page, how it looks, and what signers consent to.",
      },
      {
        name: "Verifications",
        description:
          "One-time codes by SMS or email, checked against what the end user typed, behind a fraud guard.",
      },
      {
        name: "Forms",
        description:
          "Hosted form endpoints your site posts to, screened by Risk and delivered to webhooks, email and contacts.",
      },
      {
        name: "Form submissions",
        description:
          "What people submitted to a form, with uploaded files; release spam, or delete.",
      },
      {
        name: "Scheduling hosts",
        description: "The people who can be booked: your doctors, tutors or consultants.",
      },
      {
        name: "Scheduling schedules",
        description: "A host's weekly hours and date overrides, in their local time.",
      },
      {
        name: "Scheduling event types",
        description: "What can be booked: one-on-one, a pool, collective or a group session.",
      },
      {
        name: "Scheduling availability",
        description: "Which times can be booked, for one event type or across many hosts.",
      },
      {
        name: "Scheduling bookings",
        description: "Bookings and holds: create, reschedule, cancel, approve and erase.",
      },
      {
        name: "Scheduling series",
        description: "Recurring bookings, whose occurrences can each move on their own.",
      },
      {
        name: "Scheduling calendars",
        description: "Connect a host's calendars, and choose which of them count.",
      },
      {
        name: "Scheduling settings",
        description: "Embedding origins, branding, notifications and calendar failure behaviour.",
      },
      {
        name: "Receiving",
        description: "Email received at the environment's inbound address and receiving domains.",
      },
      {
        name: "Inboxes",
        description:
          "Email addresses for agents: received mail kept as threads, sends and replies from the address.",
      },
      {
        name: "Contacts",
        description: "The people marketing email goes to, with their properties and consent.",
      },
      { name: "Audiences", description: "Lists of contacts that broadcasts are sent to." },
      { name: "Segments", description: "Contacts chosen by their properties, always up to date." },
      {
        name: "Topics",
        description: "What contacts subscribe to, and the environment's marketing settings.",
      },
      { name: "Broadcasts", description: "Marketing email sent to an audience or segment." },
      {
        name: "Reputation",
        description: "The organization's sending standing (good, warning or suspended) and why.",
      },
      { name: "Domains", description: "The organization's verified sending domains." },
      {
        name: "Dedicated IPs",
        description: "The organization's own sending IPs, warmed up automatically (an add-on).",
      },
      {
        name: "Webhook endpoints",
        description: "URLs that receive the environment's delivery events, signed.",
      },
      {
        name: "Hooks applications",
        description:
          "Hooks (webhooks as a service): your customers, each with their own endpoints and portal.",
      },
      {
        name: "Hooks event types",
        description: "The catalog of messages you send, which your customers subscribe from.",
      },
      {
        name: "Hooks endpoints",
        description:
          "Your customers' URLs that receive their messages, each signed with its own secret.",
      },
      {
        name: "Hooks messages",
        description:
          "Send a message once; coss.com delivers it to every subscribed endpoint, with retries.",
      },
      {
        name: "Hooks portal",
        description: "A ready-made page for your customers to manage their endpoints.",
      },
      {
        name: "Logs",
        description: "The environment's API requests, email events and webhook attempts.",
      },
      {
        name: "Log drains",
        description: "Endpoints of yours that receive the environment's logs as signed batches.",
      },
      {
        name: "Audit log",
        description: "Changes to the organization, by members, API keys and coss.com support.",
      },
      {
        name: "Billing",
        description: "The organization's plan, usage, invoices and credits.",
      },
      {
        name: "Risk",
        description:
          "Assess sign-ups, logins and other events: a decision with reasons, from signals and " +
          "what the environment remembers.",
      },
    ],
  };
}

export type App = ReturnType<typeof createApp>;
