/**
 * Strips secrets and customer data from what Sentry receives. `dataCollection` (options.ts) already
 * keeps bodies, cookies, query strings, IPs and most headers out; these hooks cover what the SDKs
 * still collect: URLs, span names, messages and log lines with secret path segments (open/click
 * tracking tokens, password reset tokens) or query strings, and credential headers an integration
 * may attach.
 */
import type { Breadcrumb, Event, Log, StreamedSpanJSON } from "@sentry/core";

/**
 * Path segments that are bearer secrets: whoever has the URL can act with it. Route templates
 * (`:token`) and already masked segments are kept.
 */
// Access logs have their own list: infra/lambda/mask-access-logs.mjs.
const SECRET_PATH_SEGMENTS: [RegExp, string][] = [
  // Open pixel, click redirect and one-click unsubscribe (apps/api/src/routes/tracking.ts), and the
  // preference center and unsubscribe pages (apps/api/src/routes/preferences.ts).
  [/(\/t\/[ocu]\/)(?!confirm\/)(?![:[])[^/?#\s:]+/g, "$1[token]"],
  // Double opt-in links (apps/api/src/routes/preferences.ts).
  [/(\/t\/u\/confirm\/)(?![:[])[^/?#\s:]+/g, "$1[token]"],
  // Forms' submitter verification links (apps/api/src/routes/forms-public.ts).
  [/(\/f\/c\/)(?![:[])[^/?#\s:]+/g, "$1[token]"],
  // Better Auth's emailed reset link, which redirects to the dashboard.
  [/(\/reset-password\/)(?![:[])[^/?#\s:]+/g, "$1[token]"],
];

/**
 * Other providers' API keys (imports, `@coss/migrate`): never logged on purpose, masked in case a
 * provider's error message quotes one. Postmark's tokens are bare UUIDs and travel only in headers.
 */
const SECRET_VALUES: [RegExp, string][] = [
  // Resend.
  [/\bre_[A-Za-z0-9_]{20,}/g, "re_[key]"],
  // SendGrid.
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, "SG.[key]"],
];

/**
 * Query strings and fragments of paths and URLs: tokens (`?token=`, OAuth `code`/`state`) and
 * search terms. A `?` not following a path ("why?") is kept.
 */
const QUERY = /(\/[^\s?#]*)[?#][^\s]*/g;

const SECRET_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-forwarded-for",
  "x-real-ip",
  "x-postmark-account-token",
  "x-postmark-server-token",
]);

/** Span attributes holding a URL or one of its parts. */
const URL_ATTRIBUTES = ["url", "url.full", "url.path", "http.url", "http.target", "http.route"];
/** Span attributes dropped outright: query strings, fragments and client addresses. */
const DROPPED_ATTRIBUTES = [
  "url.query",
  "http.query",
  "url.fragment",
  "http.fragment",
  "client.address",
  "client.port",
];
/** Route parameters (`url.path.parameter.token`) and credential headers. */
const DROPPED_ATTRIBUTE_PATTERN =
  /^(url\.path\.parameter\.|http\.request\.header\.(authorization|cookie|proxy-authorization|x-api-key|x-forwarded-for|x-real-ip|x-postmark-account-token|x-postmark-server-token)$|http\.response\.header\.set-cookie$)/;

/**
 * A URL, path, span name or line of text with secret path segments and provider keys masked and
 * the query strings of its paths removed.
 */
export function scrubUrl(value: string): string {
  let scrubbed = value.replace(QUERY, "$1");
  for (const [pattern, replacement] of [...SECRET_PATH_SEGMENTS, ...SECRET_VALUES]) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

/** Span attributes, in either form: raw values or `{ value, type }` objects. */
function scrubAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const key of Object.keys(attributes)) {
    if (DROPPED_ATTRIBUTES.includes(key) || DROPPED_ATTRIBUTE_PATTERN.test(key)) {
      delete attributes[key];
      continue;
    }
    if (!URL_ATTRIBUTES.includes(key)) continue;
    const value = attributes[key];
    if (typeof value === "string") {
      attributes[key] = scrubUrl(value);
    } else if (value && typeof value === "object" && "value" in value) {
      const inner = (value as { value: unknown }).value;
      if (typeof inner === "string") attributes[key] = { ...value, value: scrubUrl(inner) };
    }
  }
}

/** HTTP span names are "GET /path?query"; other names (SQL, functions) are left alone. */
function isHttpOp(op: unknown): boolean {
  const value = op && typeof op === "object" && "value" in op ? op.value : op;
  return typeof value === "string" && value.startsWith("http");
}

/** `beforeSend` (and `beforeSendTransaction` with static spans): mutates and returns the event. */
export function scrubEvent<T extends Event>(event: T): T {
  const request = event.request;
  if (request) {
    if (request.url) request.url = scrubUrl(request.url);
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        const lower = name.toLowerCase();
        if (SECRET_HEADERS.has(lower)) delete request.headers[name];
        else if (lower === "referer") request.headers[name] = scrubUrl(request.headers[name] ?? "");
      }
    }
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  // console.error lines (captureConsoleIntegration) and error messages may quote request paths.
  if (typeof event.message === "string") event.message = scrubUrl(event.message);
  // Raw console arguments can contain nested customer data; keep only the scrubbed message.
  if (event.extra) delete event.extra.arguments;
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubUrl(exception.value);
  }
  scrubAttributes(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    if (span.description && isHttpOp(span.op)) span.description = scrubUrl(span.description);
    scrubAttributes(span.data);
  }
  for (const breadcrumb of event.breadcrumbs ?? []) scrubBreadcrumb(breadcrumb);
  return event;
}

/** `beforeSendSpan`: spans are streamed one by one (the SDKs' default trace lifecycle). */
export function scrubSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  const attributes = span.attributes as Record<string, unknown>;
  if (isHttpOp(attributes["sentry.op"])) span.name = scrubUrl(span.name);
  for (const key of ["sentry.segment.name", "sentry.custom_span_name"]) {
    const value = attributes[key];
    if (typeof value === "string") attributes[key] = scrubUrl(value);
  }
  scrubAttributes(attributes);
  return span;
}

/** `beforeSendLog`: console lines (consoleLoggingIntegration) may quote request paths. */
export function scrubLog(log: Log): Log {
  log.message = scrubUrl(String(log.message));
  for (const [key, value] of Object.entries(log.attributes ?? {})) {
    if (typeof value === "string" && log.attributes) log.attributes[key] = scrubUrl(value);
  }
  return log;
}

/** `beforeBreadcrumb`: console messages and fetch/XHR/navigation breadcrumbs carry full URLs. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = scrubUrl(breadcrumb.message);
  const data = breadcrumb.data;
  if (data) {
    delete data.arguments;
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = scrubUrl(data[key]);
    }
  }
  return breadcrumb;
}
