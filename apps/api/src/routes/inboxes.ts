import type { UsageGate } from "@coss/billing/gate";
import {
  createInbox,
  deleteInbox,
  deleteInboxThread,
  type EmailService,
  getInbox,
  getInboxMessage,
  getInboxMessageAttachmentKey,
  getInboxThread,
  type InboxSendQuota,
  listInboxes,
  listInboxMessages,
  listInboxThreads,
  replyToInboxMessage,
  sendInboxMessage,
  updateInbox,
} from "@coss/email";
import {
  CreateInboxRequest,
  DEFAULT_INBOX_LIST_LIMIT,
  DeletedInbox,
  DeletedInboxThread,
  InboxList,
  InboxMessageList,
  InboxMessageObject,
  InboxObject,
  InboxThreadList,
  InboxThreadObject,
  ListInboxesQuery,
  ListInboxMessagesQuery,
  ListInboxThreadsQuery,
  ReplyInboxMessageRequest,
  SendInboxMessageRequest,
  UpdateInboxRequest,
} from "@coss/email/inbox-schemas";
import type { InboundRuntime } from "@coss/email/runtime";
import { emailSendQuota } from "@coss/ratelimit";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { limitBody, SEND_BODY_LIMIT_BYTES } from "../body-limit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError } from "../middleware/rate-limit.ts";
import { markEmailContent } from "../middleware/request-log.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";
import { attachmentDisposition } from "./received-emails.ts";

const TAG = "Inboxes";
const INBOX_NOT_FOUND = "No inbox with this id exists in this environment.";
const THREAD_NOT_FOUND = "No thread with this id exists in this inbox.";
const MESSAGE_NOT_FOUND = "No message with this id exists in this inbox.";

const InboxParams = z.object({
  inbox_id: z.string().meta({
    description: "The inbox's id.",
    examples: ["inbox_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const ThreadParams = InboxParams.extend({
  thread_id: z.string().meta({
    description: "The thread's id.",
    examples: ["thread_01k7c8m4r0c2b8w9y3d5f6g7h8"],
  }),
});

const MessageParams = InboxParams.extend({
  message_id: z.string().meta({
    description: "The message's id.",
    examples: ["imsg_01k7c8m4s1d3c9x0z4e6g7h8j9"],
  }),
});

const AttachmentParams = MessageParams.extend({
  attachment_id: z.string().meta({
    description: "The attachment's id (from the message's `attachments`).",
    examples: ["rcvdatt_01k7c8m4r0c2b8w9y3d5f6g7h8"],
  }),
});

const SendHeaders = idempotencyHeaders(
  "Makes the send safe to retry: a repeat with the same key and body returns the first message " +
    "instead of sending again (keys are per inbox).",
);

const inboxNotFound = errorDoc(`${INBOX_NOT_FOUND} (\`not_found\`)`);
const sendErrors = {
  400: errorDoc(
    "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
      "(`invalid_idempotency_key`).",
  ),
  ...commonErrors,
  403: errorDoc(
    "The API key lacks the permission this endpoint needs (`insufficient_permissions`), its " +
      "organization is suspended (`organization_suspended`), live sending is suspended " +
      "(`account_suspended`), or sending is paused for the organization (`sending_paused`).",
  ),
  409: errorDoc(
    "Requests with this `Idempotency-Key` are racing for an expired key (`request_in_progress`). " +
      "Retry after `Retry-After` seconds.",
    { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
  ),
  413: errorDoc("The request body is larger than 40 MB (`payload_too_large`)."),
  429: errorDoc(
    "Too many requests with this API key (`rate_limited`), or the message's recipients exceed " +
      "the send quota (`quota_exceeded`). Retry after `Retry-After` seconds.",
    { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
  ),
};

function accepted(description: string) {
  return {
    description,
    headers: {
      "X-Request-Id": requestIdHeader,
      "Idempotent-Replayed": idempotentReplayedHeader,
    },
    content: { "application/json": { schema: InboxMessageObject } },
  };
}

export const createInboxRoute = createRoute({
  method: "post",
  path: "/inboxes",
  operationId: "createInbox",
  tags: [TAG],
  summary: "Create an inbox",
  description:
    "Gives an agent (or anyone) its own email address in the API key's environment: " +
    "`username@<the environment's inbound domain>`, which needs no DNS setup, or an address at " +
    "one of the environment's receiving domains (`domain`). Mail to it is kept as threads, and " +
    "each message that arrives sends an `inbox.message.received` webhook. With a `client_id` " +
    "that already has an inbox, that inbox is returned (200) instead of a new one.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ inbox: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/inboxes"),
  ] as const,
  request: {
    body: { required: true, content: { "application/json": { schema: CreateInboxRequest } } },
  },
  responses: {
    201: jsonDoc("The new inbox.", InboxObject),
    200: jsonDoc("The environment's inbox with this `client_id`.", InboxObject),
    ...commonErrors,
    402: errorDoc(
      "The organization has its plan's maximum of inboxes (`plan_limit_reached`), or the Free " +
        "plan's included inbox-days are used up this month (`usage_limit_exceeded`).",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`), the address can't be used " +
        "(`invalid_address`) or is already an inbox (`address_taken`), `domain` is not a receiving domain of the environment " +
        "(`unknown_domain`), or the deployment doesn't receive email at coss.com's inbound " +
        "domain (`receiving_unavailable`).",
    ),
  },
});

export const listInboxesRoute = createRoute({
  method: "get",
  path: "/inboxes",
  operationId: "listInboxes",
  tags: [TAG],
  summary: "List inboxes",
  description:
    "The environment's inboxes, newest first. Pass the last `id` as `after` to get the next page " +
    "while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { query: ListInboxesQuery },
  responses: {
    200: jsonDoc("A page of inboxes.", InboxList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`)."),
  },
});

export const getInboxRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}",
  operationId: "getInbox",
  tags: [TAG],
  summary: "Retrieve an inbox",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: InboxParams },
  responses: {
    200: jsonDoc("The inbox.", InboxObject),
    ...commonErrors,
    404: inboxNotFound,
  },
});

export const updateInboxRoute = createRoute({
  method: "patch",
  path: "/inboxes/{inbox_id}",
  operationId: "updateInbox",
  tags: [TAG],
  summary: "Update an inbox",
  description: "Changes the name messages from the inbox are sent with. Its address never changes.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ inbox: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/inboxes/{inbox_id}"),
  ] as const,
  request: {
    params: InboxParams,
    body: { required: true, content: { "application/json": { schema: UpdateInboxRequest } } },
  },
  responses: {
    200: jsonDoc("The updated inbox.", InboxObject),
    ...commonErrors,
    404: inboxNotFound,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

export const deleteInboxRoute = createRoute({
  method: "delete",
  path: "/inboxes/{inbox_id}",
  operationId: "deleteInbox",
  tags: [TAG],
  summary: "Delete an inbox",
  description:
    "Deletes the inbox and its threads. The received emails and emails they held stay in the " +
    "environment until their retention ends, and mail to the address is still received by the " +
    "environment (without a thread or `inbox.message.received` webhook).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["delete"] }), rateLimit("api.write")],
  request: { params: InboxParams },
  responses: {
    200: jsonDoc("The inbox was deleted.", DeletedInbox),
    ...commonErrors,
    404: inboxNotFound,
  },
});

export const listInboxThreadsRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}/threads",
  operationId: "listInboxThreads",
  tags: [TAG],
  summary: "List an inbox's threads",
  description:
    "The inbox's conversations, the one with the latest message first, with a preview of that " +
    "message. A thread whose `last_inbound_at` equals its `last_message_at` awaits a reply. Pass " +
    "the last `id` as `after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: InboxParams, query: ListInboxThreadsQuery },
  responses: {
    200: jsonDoc("A page of threads.", InboxThreadList),
    ...commonErrors,
    404: inboxNotFound,
    422: errorDoc("A query parameter failed validation (`validation_error`)."),
  },
});

export const getInboxThreadRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}/threads/{thread_id}",
  operationId: "getInboxThread",
  tags: [TAG],
  summary: "Retrieve a thread",
  description:
    "The conversation with its latest messages, oldest first, each with its text and " +
    "`extracted_text` (its own words, without the quoted conversation): what an agent reads " +
    "before it replies. HTML is the sender's: sanitize it before showing it to anyone.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: ThreadParams },
  responses: {
    200: jsonDoc("The thread.", InboxThreadObject),
    ...commonErrors,
    404: errorDoc("No such inbox or thread in this environment (`not_found`)."),
  },
});

export const deleteInboxThreadRoute = createRoute({
  method: "delete",
  path: "/inboxes/{inbox_id}/threads/{thread_id}",
  operationId: "deleteInboxThread",
  tags: [TAG],
  summary: "Delete a thread",
  description:
    "Removes the conversation from the inbox. Its received emails and emails stay in the " +
    "environment until their retention ends; a later reply starts a new thread.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["delete"] }), rateLimit("api.write")],
  request: { params: ThreadParams },
  responses: {
    200: jsonDoc("The thread was deleted.", DeletedInboxThread),
    ...commonErrors,
    404: errorDoc("No such inbox or thread in this environment (`not_found`)."),
  },
});

export const listInboxMessagesRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}/messages",
  operationId: "listInboxMessages",
  tags: [TAG],
  summary: "List an inbox's messages",
  description:
    "Messages of every thread, newest first, with a preview instead of their bodies (retrieve " +
    "one for those). Pass the last `id` as `after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: InboxParams, query: ListInboxMessagesQuery },
  responses: {
    200: jsonDoc("A page of messages.", InboxMessageList),
    ...commonErrors,
    404: inboxNotFound,
    422: errorDoc("A query parameter failed validation (`validation_error`)."),
  },
});

export const getInboxMessageRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}/messages/{message_id}",
  operationId: "getInboxMessage",
  tags: [TAG],
  summary: "Retrieve a message",
  description:
    "The message with its text, HTML and `extracted_text`. An outbound message's delivery is " +
    "its email's (`email_id`).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: MessageParams },
  responses: {
    200: jsonDoc("The message.", InboxMessageObject),
    ...commonErrors,
    404: errorDoc("No such inbox or message in this environment (`not_found`)."),
  },
});

export const getInboxMessageAttachmentRoute = createRoute({
  method: "get",
  path: "/inboxes/{inbox_id}/messages/{message_id}/attachments/{attachment_id}",
  operationId: "getInboxMessageAttachment",
  tags: [TAG],
  summary: "Download an attachment of a message",
  description:
    "An inbound message's attachment, always as `application/octet-stream` (its declared type " +
    "is the attachment's `content_type`): treat it as untrusted.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ inbox: ["read"] }), rateLimit("api.read")],
  request: { params: AttachmentParams },
  responses: {
    200: {
      description: "The attachment.",
      headers: { "X-Request-Id": requestIdHeader },
      content: {
        "application/octet-stream": { schema: z.string().meta({ format: "binary" }) },
      },
    },
    ...commonErrors,
    404: errorDoc("No such inbox, message or attachment in this environment (`not_found`)."),
  },
});

export const sendInboxMessageRoute = createRoute({
  method: "post",
  path: "/inboxes/{inbox_id}/messages",
  operationId: "sendInboxMessage",
  tags: [TAG],
  summary: "Send a message from an inbox",
  description:
    "Starts a thread with a message from the inbox's address, sent like any email (its " +
    "`email_id` has its delivery events and webhooks; never tracked). Replies to it arrive in " +
    "the same thread. Live inboxes send only from receiving domains under one of the " +
    "organization's verified domains (`can_send`); sandbox ones always can, and deliver nothing. " +
    "Recipients count against the send quota.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ inbox: ["send"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/inboxes/{inbox_id}/messages"),
  ] as const,
  request: {
    params: InboxParams,
    headers: SendHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: SendInboxMessageRequest } },
    },
  },
  responses: {
    202: accepted("The message, queued for delivery. A replay returns the first one."),
    ...sendErrors,
    404: inboxNotFound,
    422: errorDoc(
      "The body failed validation (`validation_error`, `invalid_message`), the inbox can't send " +
        "(`inbox_cannot_send`), its domain is not verified for sending (`domain_not_verified`), " +
        "or the `Idempotency-Key` was used with a different body (`idempotency_key_reused`).",
    ),
  },
});

export const replyToInboxMessageRoute = createRoute({
  method: "post",
  path: "/inboxes/{inbox_id}/messages/{message_id}/reply",
  operationId: "replyToInboxMessage",
  tags: [TAG],
  summary: "Reply to a message",
  description:
    "Replies in the message's thread from the inbox's address: to its sender (its `Reply-To` " +
    "first), or to an outbound message's recipients again for a follow-up; `reply_all` adds " +
    "everyone else on it. The subject gets `Re:`, and `In-Reply-To`/`References` let the " +
    "recipient's mail client thread it. Sent like any email, counted against the send quota.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ inbox: ["send"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/inboxes/{inbox_id}/messages/{message_id}/reply"),
  ] as const,
  request: {
    params: MessageParams,
    headers: SendHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: ReplyInboxMessageRequest } },
    },
  },
  responses: {
    202: accepted("The reply, queued for delivery. A replay returns the first one."),
    ...sendErrors,
    404: errorDoc("No such inbox or message in this environment (`not_found`)."),
    422: errorDoc(
      "The body failed validation (`validation_error`, `invalid_message`), the inbox can't send " +
        "(`inbox_cannot_send`), the message has no address to reply to (`no_reply_recipient`), " +
        "its domain is not verified for sending (`domain_not_verified`), or the " +
        "`Idempotency-Key` was used with a different body (`idempotency_key_reused`).",
    ),
  },
});

/** The API key's send quota for an inbox send, charged once the recipients are known. */
function sendQuota(c: Context<AppEnv>): InboxSendQuota {
  let charged: ReturnType<typeof emailSendQuota> | null = null;
  return {
    async consume(recipients) {
      const quota = emailSendQuota(c.var.auth, recipients);
      const decision = await c.var.rateLimiter.consume(quota);
      if (!decision.allowed) {
        return {
          allowed: false,
          error: rateLimitError(decision, {
            code: "quota_exceeded",
            message:
              decision.retryAfterMs === null
                ? "This message has more recipients than the send quota allows at once."
                : `The send quota (${decision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
          }),
        };
      }
      charged = quota;
      return { allowed: true };
    },
    async refund() {
      if (charged) await c.var.rateLimiter.refund(charged);
      charged = null;
    },
  };
}

export function createInboxRoutes(deps: {
  emailService: EmailService;
  inbound: InboundRuntime | null;
  /** Free's allowance: a live inbox reserves its first day, a deleted one its uncharged days. */
  billing?: UsageGate;
}): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const env = (c: Context<AppEnv>) => {
    const { organizationId, projectId, environmentId, mode } = c.var.auth;
    return { organizationId, projectId, environmentId, mode };
  };

  router.openapi(createInboxRoute, async (c) => {
    const body = c.req.valid("json");
    const { inbox, created } = await createInbox(
      env(c),
      {
        username: body.username,
        domain: body.domain,
        displayName: body.display_name,
        clientId: body.client_id,
      },
      {
        managedDomain: deps.inbound?.managedDomain ?? null,
        plans: c.var.plans ?? undefined,
        billing: deps.billing,
      },
    );
    if (!created) return c.json(inbox, 200);
    await recordApiAudit(c, {
      action: "inbox.created",
      target: { type: "inbox", id: inbox.id, label: inbox.address },
    });
    return c.json(inbox, 201);
  });

  router.openapi(listInboxesRoute, async (c) => {
    const query = c.req.valid("query");
    const page = await listInboxes({
      ...env(c),
      limit: query.limit ?? DEFAULT_INBOX_LIST_LIMIT,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getInboxRoute, async (c) => {
    const { inbox_id: id } = c.req.valid("param");
    const inbox = await getInbox({ ...env(c), id });
    if (!inbox) throw notFound(INBOX_NOT_FOUND);
    return c.json(inbox, 200);
  });

  router.openapi(updateInboxRoute, async (c) => {
    const { inbox_id: id } = c.req.valid("param");
    const body = c.req.valid("json");
    const inbox = await updateInbox({ ...env(c), id }, { displayName: body.display_name });
    await recordApiAudit(c, {
      action: "inbox.updated",
      target: { type: "inbox", id, label: inbox.address },
      metadata: { display_name: inbox.display_name },
    });
    return c.json(inbox, 200);
  });

  router.openapi(deleteInboxRoute, async (c) => {
    const { inbox_id: id } = c.req.valid("param");
    const inbox = await getInbox({ ...env(c), id });
    if (!inbox || !(await deleteInbox({ ...env(c), id }, { billing: deps.billing }))) {
      throw notFound(INBOX_NOT_FOUND);
    }
    await recordApiAudit(c, {
      action: "inbox.deleted",
      target: { type: "inbox", id, label: inbox.address },
    });
    return c.json({ object: "inbox" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listInboxThreadsRoute, async (c) => {
    const { inbox_id: inboxId } = c.req.valid("param");
    const query = c.req.valid("query");
    const page = await listInboxThreads({
      ...env(c),
      inboxId,
      limit: query.limit ?? DEFAULT_INBOX_LIST_LIMIT,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getInboxThreadRoute, async (c) => {
    const { inbox_id: inboxId, thread_id: id } = c.req.valid("param");
    const thread = await getInboxThread({ ...env(c), inboxId, id });
    if (!thread) throw notFound(THREAD_NOT_FOUND);
    return c.json(thread, 200);
  });

  router.openapi(deleteInboxThreadRoute, async (c) => {
    const { inbox_id: inboxId, thread_id: id } = c.req.valid("param");
    if (!(await deleteInboxThread({ ...env(c), inboxId, id }))) throw notFound(THREAD_NOT_FOUND);
    await recordApiAudit(c, {
      action: "inbox_thread.deleted",
      target: { type: "inbox_thread", id },
      metadata: { inbox_id: inboxId },
    });
    return c.json({ object: "inbox_thread" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listInboxMessagesRoute, async (c) => {
    const { inbox_id: inboxId } = c.req.valid("param");
    const query = c.req.valid("query");
    const page = await listInboxMessages({
      ...env(c),
      inboxId,
      limit: query.limit ?? DEFAULT_INBOX_LIST_LIMIT,
      after: query.after,
      direction: query.direction,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getInboxMessageRoute, async (c) => {
    const { inbox_id: inboxId, message_id: id } = c.req.valid("param");
    const message = await getInboxMessage({ ...env(c), inboxId, id });
    if (!message) throw notFound(MESSAGE_NOT_FOUND);
    return c.json(message, 200);
  });

  router.openapi(getInboxMessageAttachmentRoute, async (c) => {
    const { inbox_id: inboxId, message_id: id, attachment_id } = c.req.valid("param");
    const attachment = await getInboxMessageAttachmentKey({
      ...env(c),
      inboxId,
      id,
      attachmentId: attachment_id,
    });
    const content = attachment && (await deps.inbound?.store.get(attachment.contentKey));
    if (!attachment || !content) {
      throw notFound("No such message or attachment exists in this inbox.");
    }
    return c.body(content as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": attachmentDisposition(attachment.filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
  });

  const sender = (c: Context<AppEnv>, inboxId: string, idempotencyKey: string | undefined) => ({
    environment: env(c),
    apiKeyId: c.var.auth.apiKeyId,
    apiKeyOwnerId: c.var.auth.ownerUserId,
    inboxId,
    idempotencyKey,
    traceparent: c.var.traceparent,
    quota: sendQuota(c),
  });

  router.openapi(
    sendInboxMessageRoute,
    async (c) => {
      const { inbox_id: inboxId } = c.req.valid("param");
      const key = c.req.valid("header")["Idempotency-Key"];
      const { message, replayed, contentStorage } = await sendInboxMessage(deps.emailService, {
        ...sender(c, inboxId, key),
        request: c.req.valid("json"),
      });
      markEmailContent(c, [{ content_storage: { mode: contentStorage } }]);
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(message, 202);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(
    replyToInboxMessageRoute,
    async (c) => {
      const { inbox_id: inboxId, message_id: messageId } = c.req.valid("param");
      const key = c.req.valid("header")["Idempotency-Key"];
      const { message, replayed, contentStorage } = await replyToInboxMessage(deps.emailService, {
        ...sender(c, inboxId, key),
        messageId,
        request: c.req.valid("json"),
      });
      markEmailContent(c, [{ content_storage: { mode: contentStorage } }]);
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(message, 202);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  return router;
}
