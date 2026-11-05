import { getStorageSettings } from "@coss/email";
import {
  EMAIL_CONTENT_KEYS,
  type LogWriter,
  loggedRequestHeaders,
  loggedResponseHeaders,
  redactBody,
} from "@coss/logs";
import type { RefusedKeyContext } from "@coss/tenancy";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.ts";

/** Stop reading response bodies for the log once they exceed this byte limit. */
const MAX_LOGGED_RESPONSE_BYTES = 64 * 1024;
const TYPE_ID = /^([a-z][a-z_]*)_[0-7][0-9a-hjkmnp-tv-z]{25}$/;

/** Reads that are not logged: the logs themselves, and the audit log. */
const UNLOGGED_READS = ["/v1/logs", "/v1/audit_events"];
/**
 * `coss listen`'s long polls: one every 20 s per listener would crowd the log it tails, and their
 * answers are event payloads. Each delivery it forwards is logged as `webhook.forward` instead.
 */
const LISTENER_POLL = /^\/v1\/webhook_listeners\/[^/]+\/poll$/;

/**
 * Requests that are not logged: anything outside `/v1`, preflights, and reading the logs or the
 * audit log. The audit log is organization-wide and readable only by owners and admins, while
 * every member can read an environment's log, so its responses must never be copied into one.
 */
function skipped(method: string, path: string): boolean {
  if (!path.startsWith("/v1/")) return true;
  if (method === "OPTIONS") return true;
  if (method === "POST" && LISTENER_POLL.test(path)) return true;
  return (
    // Hono runs GET handlers for HEAD and strips the body after middleware completes.
    (method === "GET" || method === "HEAD") &&
    UNLOGGED_READS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
}

/**
 * Responses carrying customer content the log must not copy: received emails (bodies, headers,
 * attachments of third-party mail, also in inboxes' threads and messages) and received text
 * messages (other people's words). Logged lines would outlive deleting them, and every member reads
 * the environment's log and its drains. Error envelopes are still kept.
 */
const CONTENT_RESPONSES = ["/v1/received_emails", "/v1/inboxes", "/v1/sms/received"];
/** Form submissions: what people typed into a customer's form (`/v1/forms/{id}/submissions…`). */
const FORM_SUBMISSIONS = /^\/v1\/forms\/[^/]+\/submissions(\/|$)/;
/**
 * Scheduling's attendee details and answers: these requests carry them both ways, always. A calendar
 * delegation's requests carry a service account's private key or an app's client secret.
 */
const SCHEDULING_PERSONAL =
  /^\/v1\/scheduling\/((bookings|holds|series|attendees|booker_sessions|calendar_delegations)(\/|$)|hosts\/[^/]+\/calendar_connections)/;
/**
 * Responses that are capabilities: preference links change a contact's consent and need
 * `contact:update`, and Sign's session links (the token is in the URL's fragment too) sign as a
 * signer or edit a template; reading the log (every member, every drain) needs none of that.
 */
const CAPABILITY_RESPONSES = [
  /^\/v1\/scheduling\/hosts\/[^/]+\/sessions$/,
  /^\/v1\/scheduling\/booker_sessions$/,
  /^\/v1\/contacts\/[^/]+\/preference_links$/,
  /^\/v1\/sign\/requests\/[^/]+\/signers\/[^/]+\/sessions$/,
  /^\/v1\/sign\/templates\/[^/]+\/builder_sessions$/,
];

/**
 * Stateless lookup identifiers and classification text must not enter request logs. Lookup
 * responses (including errors) are omitted too; assessments' `content` is redacted by `redactBody`.
 */
const STATELESS_LOOKUPS = ["/v1/risk/email/check", "/v1/risk/ip/check", "/v1/risk/phone/check"];
const CONTENT_REQUESTS = ["/v1/risk/content/classify", ...STATELESS_LOOKUPS];

/** One-time codes the end user typed (Verify's checks) never enter request logs, even refused. */
const SECRET_REQUESTS = ["/v1/verifications/check"];

/**
 * Requests and responses that carry emails' content (sends, batches, reads, cancel, reschedule,
 * inboxes' sends and replies):
 * their subjects, bodies, headers, template variables and attachment filenames are redacted (the
 * log would otherwise keep what the email itself doesn't) when an email they answer with was sent
 * without content storage (`markEmailContent`, from the email's own snapshot: a read or an
 * idempotent replay after switching back to `store`), or when the environment's content storage
 * is `discard` now (requests refused before any email exists).
 */
const EMAIL_CONTENT_PATHS = /^\/v1\/(emails(\/|$)|inboxes\/[^/]+\/messages(\/|$))/;

/** Marks the request as answering with an email sent without content storage, if one is. */
export function markEmailContent(
  c: Context<AppEnv>,
  emails: readonly { content_storage: { mode: string } }[],
): void {
  if (emails.some((email) => email.content_storage.mode === "discard")) {
    c.set("discardsEmailContent", true);
  }
}

async function contentKeysFor(
  path: string,
  auth: { organizationId: string; environmentId: string },
  marked: boolean,
): Promise<readonly string[] | undefined> {
  if (!EMAIL_CONTENT_PATHS.test(path)) return undefined;
  if (marked) return EMAIL_CONTENT_KEYS;
  const { contentStorage } = await getStorageSettings(auth);
  return contentStorage === "discard" ? EMAIL_CONTENT_KEYS : undefined;
}

function keepsRequestBody(path: string): boolean {
  if (SCHEDULING_PERSONAL.test(path)) return false;
  return !CONTENT_REQUESTS.includes(path) && !SECRET_REQUESTS.includes(path);
}

function keepsResponseBody(path: string, status: number): boolean {
  if (CONTENT_REQUESTS.includes(path)) return false;
  if (status >= 400) return true;
  if (CAPABILITY_RESPONSES.some((pattern) => pattern.test(path))) return false;
  if (FORM_SUBMISSIONS.test(path)) return false;
  if (SCHEDULING_PERSONAL.test(path)) return false;
  return !CONTENT_RESPONSES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

type ErrorEnvelope = { error?: { type?: unknown; code?: unknown } };

/** The resource a request is about: the returned object, else the id in the path. */
function resourceOf(
  path: string,
  body: unknown,
): { resourceType: string | null; resourceId: string | null } {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const { object, id } = body as { object?: unknown; id?: unknown };
    if (typeof object === "string" && object !== "list" && typeof id === "string") {
      return { resourceType: object, resourceId: id };
    }
  }
  for (const segment of path.split("/").reverse()) {
    if (TYPE_ID.test(segment)) return { resourceType: null, resourceId: segment };
  }
  return { resourceType: null, resourceId: null };
}

function parseJson(text: string): unknown {
  try {
    return text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readJson(source: Response): Promise<unknown> {
  const reader = source.body?.getReader();
  if (!reader) return undefined;
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return parseJson(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > MAX_LOGGED_RESPONSE_BYTES) {
        // A clone's cancellation can wait for the original response to finish. Do not await it.
        void reader.cancel().catch(() => {});
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

function isJson(headers: Headers): boolean {
  return headers.get("content-type")?.toLowerCase().includes("json") ?? false;
}

/**
 * Logs every `/v1` request that can be attributed to an environment (an authenticated key, or a
 * valid key refused for its permissions or suspension) as an `api.request` line. Bodies are read
 * after the response is produced and only in redacted form; the write is buffered and never
 * delays or fails the request.
 */
export function requestLog(writer: LogWriter) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;
    if (skipped(method, path)) return next();

    const started = performance.now();
    const occurredAt = new Date();
    await next();
    const durationMs = performance.now() - started;

    const auth =
      (c.get("auth") as RefusedKeyContext | undefined) ??
      (c.get("attemptedAuth") as RefusedKeyContext | undefined);
    if (!auth) return;

    const response = c.res;
    const status = response.status;
    const route = c.req.routePath.endsWith("*") ? null : c.req.routePath;
    // Only bodies the handler already parsed (no second read of a 40 MB upload); Hono caches
    // what `c.req.json()` read as text.
    // Live traffic of an organization in HIPAA mode: metadata only, here and in its log drains.
    const metadataOnly = auth.hipaaMode && auth.mode === "live";
    const requestText =
      !metadataOnly && keepsRequestBody(path)
        ? (c.req.bodyCache.text as Promise<string> | undefined)
        : undefined;
    const length = Number(response.headers.get("content-length") ?? Number.NaN);
    const responseCopy =
      !metadataOnly &&
      isJson(response.headers) &&
      !(length > MAX_LOGGED_RESPONSE_BYTES) &&
      keepsResponseBody(path, status)
        ? response.clone()
        : null;
    const requestHeaders = loggedRequestHeaders(c.req.raw.headers);
    const responseHeaders = loggedResponseHeaders(response.headers);
    const { requestId, clientIp } = c.var;
    const search = metadataOnly ? "" : new URL(c.req.url).search;
    const marked = c.get("discardsEmailContent") === true;

    void (async () => {
      const [requestJson, responseJson] = await Promise.all([
        requestText?.then(parseJson, () => undefined),
        responseCopy ? readJson(responseCopy) : undefined,
      ]);
      const content =
        requestJson === undefined && responseJson === undefined
          ? undefined
          : await contentKeysFor(path, auth, marked);
      const error = (responseJson as ErrorEnvelope | undefined)?.error;
      const { resourceType, resourceId } = resourceOf(path, responseJson);
      writer.write({
        organizationId: auth.organizationId,
        projectId: auth.projectId,
        environmentId: auth.environmentId,
        occurredAt,
        source: "api",
        level: status >= 500 ? "error" : status >= 400 ? "warning" : "info",
        type: "api.request",
        message: `${method} ${path} ${status}`,
        requestId,
        apiKeyId: auth.apiKeyId,
        method,
        path,
        route,
        statusCode: status,
        durationMs,
        clientIp,
        userAgent: c.req.header("user-agent") ?? null,
        errorCode: typeof error?.code === "string" ? error.code : null,
        resourceType,
        resourceId,
        attributes: {
          request: {
            ...(search ? { query: search.slice(1) } : {}),
            headers: requestHeaders,
            ...(requestJson === undefined ? {} : { body: redactBody(requestJson, { content }) }),
          },
          response: {
            headers: responseHeaders,
            ...(responseJson === undefined ? {} : { body: redactBody(responseJson, { content }) }),
          },
          ...(typeof error?.type === "string" ? { error_type: error.type } : {}),
        },
      });
    })().catch((error: unknown) => {
      console.error(`[api] request log failed (request_id=${requestId}):`, error);
    });
  });
}
