/** `Sentry.init` options shared by servers and browsers. No zod here: browsers load this module. */
import type { DataCollection, Options } from "@sentry/core";
import type { SentryConfig } from "./config.ts";
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubSpan } from "./scrub.ts";

/** The services reporting to Sentry, tagged `service` on every event. */
export type SentryService =
  | "web"
  | "site"
  | "api"
  | "worker"
  | "portal"
  | "sign"
  | "scheduling"
  | "smtp";

/** Paths not worth a trace: load balancer health checks and the browser tunnel. */
const UNTRACED_PATH = /^\/(api\/)?(health|monitoring)\/?$/;
// `coss listen`'s long polls wait up to 25 s by design: traced, they would read as slow requests.
const LISTENER_POLL_PATH = /^\/v1\/webhook_listeners\/[^/]+\/poll$/;

/** Streamed spans are matched when they start, before a server knows the route: by path. */
const IGNORED_SPANS: NonNullable<Options["ignoreSpans"]> = [
  { attributes: { "url.path": UNTRACED_PATH } },
  { attributes: { "http.target": UNTRACED_PATH } },
  { attributes: { "url.path": LISTENER_POLL_PATH } },
  { attributes: { "http.target": LISTENER_POLL_PATH } },
];

/**
 * What the SDKs may collect. Their defaults collect nearly everything (request and response
 * bodies — email content —, IPs, cookies, query strings, AI prompts — screened emails —, database
 * parameters, queue payloads, local variables); coss.com sends none of it. Users are set explicitly
 * (an id only), never derived from requests.
 */
export const DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { allow: ["user-agent", "content-type", "content-length", "accept", "coss-version"] },
    response: { allow: ["content-type", "content-length", "retry-after", "x-request-id"] },
  },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/** Options every SDK shares; each app adds its integrations. */
export function sentryOptions(config: SentryConfig, service: SentryService) {
  return {
    dsn: config.dsn,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate,
    ignoreSpans: IGNORED_SPANS,
    dataCollection: DATA_COLLECTION,
    initialScope: { tags: { service } },
    beforeSend: scrubEvent,
    // Spans are streamed (the SDKs' default), so this replaces `beforeSendTransaction`.
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
    beforeBreadcrumb: scrubBreadcrumb,
    // `satisfies`: an option the SDK renames or drops fails the typecheck instead of being ignored.
  } satisfies Partial<Options>;
}
