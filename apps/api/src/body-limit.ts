import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { errorResponse, payloadTooLarge } from "./errors.ts";

/** Where the hosted MCP server is served. */
export const MCP_PATH = "/mcp";

/** Every route except the send and upload routes (`hasOwnBodyLimit`). */
export const BODY_LIMIT_BYTES = 5 * 1024 * 1024;
/**
 * The send routes: room for 25 MB of attachments once base64-encoded (4/3), plus the body. A batch
 * shares this limit across all of its emails.
 */
export const SEND_BODY_LIMIT_BYTES = 40 * 1024 * 1024;

export function limitBody(maxSize: number) {
  return bodyLimit({ maxSize, onError: (c) => errorResponse(c, payloadTooLarge(maxSize)) });
}

/** Routes that take files (PDFs, attachments), each limited after authenticating the caller. */
const OWN_LIMIT_PATHS: ReadonlySet<string> = new Set([
  "/v1/emails",
  "/v1/emails/batch",
  // Sign: a document upload, and a signature request with inline documents.
  "/v1/sign/documents",
  "/v1/sign/requests",
  "/v1/sign/templates",
]);

/** Template updates take inline documents too. */
const OWN_LIMIT_PATCH = /^\/v1\/sign\/templates\/[^/]+$/;

/** Inboxes' sends and replies, with attachments like `/v1/emails`. */
const OWN_LIMIT_POST = /^\/v1\/inboxes\/[^/]+\/messages(\/[^/]+\/reply)?$/;

/**
 * The send and upload routes enforce their own, larger limit after authenticating the caller;
 * Forms' public endpoint (`/f/*`) its own too, answered with text rather than the envelope, and the
 * hosted MCP server (`/mcp`) a smaller one, answered in JSON-RPC.
 */
export function hasOwnBodyLimit(c: Context): boolean {
  return (
    c.req.path === MCP_PATH ||
    (c.req.method === "POST" &&
      (OWN_LIMIT_PATHS.has(c.req.path) || OWN_LIMIT_POST.test(c.req.path))) ||
    c.req.path.startsWith("/f/") ||
    (c.req.method === "PATCH" && OWN_LIMIT_PATCH.test(c.req.path))
  );
}
