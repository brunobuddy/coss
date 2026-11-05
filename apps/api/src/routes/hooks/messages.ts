import type { UsageGate } from "@coss/billing/gate";
import {
  countHookFanout,
  createHookPortalSession,
  getHookDelivery,
  getHookMessage,
  HookError,
  listHookAttempts,
  listMessageDeliveries,
  pageHookMessages,
  portalSessionUrl,
  replayHookMessage,
  retryHookDelivery,
  sendHookMessage,
  toHookAttemptObject,
  toHookDeliveryObject,
  toHookMessageObject,
} from "@coss/hooks";
import {
  CreateHookPortalSessionRequest,
  HookAttemptList,
  HookDeliveryList,
  HookDeliveryObject,
  HookMessageList,
  HookMessageObject,
  HookPortalSessionObject,
  ListHookMessagesQuery,
  SendHookMessageRequest,
} from "@coss/hooks/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../../audit.ts";
import { ApiError } from "../../errors.ts";
import { requireApiKey } from "../../middleware/api-key.ts";
import { upgradeRequestBody } from "../../middleware/api-version.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";
import type { AppEnv } from "../../types.ts";
import { validationHook } from "../../validation.ts";
import { commonErrors, errorDoc, jsonDoc } from "../docs.ts";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "../emails.ts";
import { quotaExceeded, refundSendQuota, tryChargeSendQuota } from "./quota.ts";
import {
  ApplicationParams,
  applicationNotFound,
  bodyErrors,
  requireApplication,
  SCOPE_NOTE,
  TAGS,
} from "./shared.ts";

const SendHeaders = z.object({
  "Idempotency-Key": z
    .string()
    .min(1)
    .max(IDEMPOTENCY_KEY_MAX_LENGTH)
    .optional()
    .meta({
      description:
        "Makes retries safe: a repeated request with the same key and body returns the original " +
        "message instead of sending again, for 24 hours. " +
        `1-${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
      examples: ["invoice-1042-paid"],
    }),
});

const MessageParams = ApplicationParams.extend({
  message_id: z.string().meta({ examples: ["hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const DeliveryParams = ApplicationParams.extend({
  delivery_id: z.string().meta({ examples: ["hdel_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const MESSAGES = "/hooks/applications/{application}/messages";
const DELIVERIES = "/hooks/applications/{application}/deliveries";

export const sendHookMessageRoute = createRoute({
  method: "post",
  path: MESSAGES,
  operationId: "sendHookMessage",
  tags: [TAGS.messages],
  summary: "Send a message",
  description:
    "Queues a message to the application: coss.com delivers it to each of its enabled endpoints " +
    "subscribed to `event_type` within seconds, signed with each endpoint's secret, and retries " +
    "failures with backoff for about a day. Each request's `webhook-id` header is the message's " +
    "id. Counts against the send quota once per endpoint it goes to (at least once). A live " +
    "message is billed once, whatever its fan-out; retries and sandbox are free. Live sends are " +
    "refused while the organization is suspended (`account_suspended`), on a billing hold " +
    "(`billing_hold`), over a budget (`budget_exceeded`) or past Free's monthly messages " +
    `(\`usage_limit_exceeded\`). ${SCOPE_NOTE}`,
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["send"] }),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/hooks/applications/{application}/messages"),
  ],
  request: {
    params: ApplicationParams,
    headers: SendHeaders,
    body: { required: true, content: { "application/json": { schema: SendHookMessageRequest } } },
  },
  responses: {
    202: {
      ...jsonDoc("The message, queued for delivery.", HookMessageObject),
      headers: {
        ...jsonDoc("", HookMessageObject).headers,
        "Idempotent-Replayed": {
          description: "`true` when the response replays an earlier request with this key.",
          schema: { type: "string" as const, enum: ["true"] },
        },
      },
    },
    ...bodyErrors,
    ...commonErrors,
    402: errorDoc(
      "The plan or the account's billing stands in the way of this live send: Free's monthly " +
        "messages are used up (`usage_limit_exceeded`), an invoice is overdue or the spend or credit limit " +
        "was reached (`billing_hold`), or a budget is spent (`budget_exceeded`).",
    ),
    404: applicationNotFound,
    409: errorDoc(
      "A request with this Idempotency-Key is still in progress (`request_in_progress`); retry.",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`), the payload is larger than 256 KB " +
        "(`payload_too_large`), or the Idempotency-Key was used with another body " +
        "(`idempotency_key_reused`).",
    ),
  },
});

export const listHookMessagesRoute = createRoute({
  method: "get",
  path: MESSAGES,
  operationId: "listHookMessages",
  tags: [TAGS.messages],
  summary: "List messages",
  description: "The application's messages, newest first (kept for 30 days).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: ApplicationParams, query: ListHookMessagesQuery },
  responses: {
    200: jsonDoc("A page of messages.", HookMessageList),
    ...commonErrors,
    404: applicationNotFound,
  },
});

export const getHookMessageRoute = createRoute({
  method: "get",
  path: `${MESSAGES}/{message_id}`,
  operationId: "getHookMessage",
  tags: [TAGS.messages],
  summary: "Retrieve a message",
  description: "A message of the application, with its payload.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: MessageParams },
  responses: {
    200: jsonDoc("The message.", HookMessageObject),
    ...commonErrors,
    404: errorDoc("No such application or message (`application_not_found`, `not_found`)."),
  },
});

export const listHookMessageDeliveriesRoute = createRoute({
  method: "get",
  path: `${MESSAGES}/{message_id}/deliveries`,
  operationId: "listHookMessageDeliveries",
  tags: [TAGS.messages],
  summary: "List a message's deliveries",
  description: "One delivery per endpoint the message went to.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: MessageParams },
  responses: {
    200: jsonDoc("The message's deliveries.", HookDeliveryList),
    ...commonErrors,
    404: errorDoc("No such application or message (`application_not_found`, `not_found`)."),
  },
});

export const getHookDeliveryRoute = createRoute({
  method: "get",
  path: `${DELIVERIES}/{delivery_id}`,
  operationId: "getHookDelivery",
  tags: [TAGS.messages],
  summary: "Retrieve a delivery",
  description: "One message's delivery to one endpoint.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: DeliveryParams },
  responses: {
    200: jsonDoc("The delivery.", HookDeliveryObject),
    ...commonErrors,
    404: errorDoc("No such application or delivery (`application_not_found`, `not_found`)."),
  },
});

export const listHookDeliveryAttemptsRoute = createRoute({
  method: "get",
  path: `${DELIVERIES}/{delivery_id}/attempts`,
  operationId: "listHookDeliveryAttempts",
  tags: [TAGS.messages],
  summary: "List a delivery's attempts",
  description: "Every HTTP request of the delivery, oldest first, with response excerpts.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: DeliveryParams },
  responses: {
    200: jsonDoc("The delivery's attempts.", HookAttemptList),
    ...commonErrors,
    404: errorDoc("No such application or delivery (`application_not_found`, `not_found`)."),
  },
});

export const retryHookDeliveryRoute = createRoute({
  method: "post",
  path: `${DELIVERIES}/{delivery_id}/retry`,
  operationId: "retryHookDelivery",
  tags: [TAGS.messages],
  summary: "Retry a delivery",
  description:
    "Queues a finished delivery for one more attempt within seconds, to the endpoint's current " +
    "URL and secret. A `pending` delivery is returned unchanged.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["update"] }), rateLimit("api.write")],
  request: { params: DeliveryParams },
  responses: {
    200: jsonDoc("The delivery.", HookDeliveryObject),
    ...commonErrors,
    404: errorDoc("No such application or delivery (`application_not_found`, `not_found`)."),
  },
});

export const createHookPortalSessionRoute = createRoute({
  method: "post",
  path: "/hooks/applications/{application}/portal_sessions",
  operationId: "createHookPortalSession",
  tags: [TAGS.portal],
  summary: "Create a portal session",
  description:
    "Signs the application's user in to the portal, where they add endpoints, pick event types, " +
    "see deliveries and retry them, without you building any UI. Create one each time the user " +
    "opens it (from your backend: never expose the API key) and open or embed the returned `url`; " +
    "embedding needs the site's origin in the environment's portal settings.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/hooks/applications/{application}/portal_sessions"),
  ],
  request: {
    params: ApplicationParams,
    body: {
      required: true,
      content: { "application/json": { schema: CreateHookPortalSessionRequest } },
    },
  },
  responses: {
    200: jsonDoc("The session, with its URL.", HookPortalSessionObject),
    ...bodyErrors,
    ...commonErrors,
    404: applicationNotFound,
    422: errorDoc("The body failed validation (`validation_error`)."),
    503: errorDoc("The portal isn't available yet (`portal_unavailable`)."),
  },
});

function invalidIdempotencyKey(): ApiError {
  return new ApiError(400, {
    type: "invalid_request_error",
    code: "invalid_idempotency_key",
    message: `The Idempotency-Key header must be 1-${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
    param: "Idempotency-Key",
  });
}

export function createHookMessageRoutes(opts: {
  portalUrl: string | null;
  billing?: UsageGate | undefined;
}): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    sendHookMessageRoute,
    async (c) => {
      const application = await requireApplication(c.var.auth, c.req.valid("param").application);
      const body = c.req.valid("json");
      const input = {
        application,
        eventType: body.event_type,
        payload: body.payload,
        idempotencyKey: c.req.valid("header")["Idempotency-Key"],
        billing: opts.billing,
        apiKeyId: c.var.auth.apiKeyId,
        apiKeyOwnerId: c.var.auth.ownerUserId,
      };
      const fanout = await countHookFanout({
        organizationId: application.organizationId,
        applicationId: application.id,
        eventType: body.event_type,
      });
      const quota = await tryChargeSendQuota(c, fanout);
      if (quota.denied) {
        // A matching replay needs no quota (and sends nothing).
        const replay = await replayHookMessage(input);
        if (replay) {
          c.header("Idempotent-Replayed", "true");
          return c.json(toHookMessageObject(replay), 202);
        }
        throw quotaExceeded(quota.denied);
      }
      let sent: Awaited<ReturnType<typeof sendHookMessage>>;
      try {
        sent = await sendHookMessage(input);
      } catch (error) {
        await refundSendQuota(c, quota);
        throw error;
      }
      if (sent.replayed) {
        await refundSendQuota(c, quota);
        c.header("Idempotent-Replayed", "true");
      }
      return c.json(toHookMessageObject(sent.message), 202);
    },
    // A bad Idempotency-Key is a 400, not a 422 (as for emails).
    (result) => {
      if (!result.success && result.target === "header") throw invalidIdempotencyKey();
      validationHook(result);
    },
  );

  router.openapi(listHookMessagesRoute, async (c) => {
    const application = await requireApplication(c.var.auth, c.req.valid("param").application);
    const query = c.req.valid("query");
    const page = await pageHookMessages({
      organizationId: application.organizationId,
      applicationId: application.id,
      eventType: query.event_type,
      limit: query.limit,
      after: query.after,
    });
    return c.json(
      {
        object: "list" as const,
        data: page.messages.map(toHookMessageObject),
        has_more: page.hasMore,
      },
      200,
    );
  });

  async function requireMessage(c: { var: AppEnv["Variables"] }, ref: string, id: string) {
    const application = await requireApplication(c.var.auth, ref);
    const message = await getHookMessage({
      organizationId: application.organizationId,
      applicationId: application.id,
      id,
    });
    if (!message) throw new HookError("not_found", "Message not found.");
    return message;
  }

  router.openapi(getHookMessageRoute, async (c) => {
    const { application, message_id } = c.req.valid("param");
    return c.json(toHookMessageObject(await requireMessage(c, application, message_id)), 200);
  });

  router.openapi(listHookMessageDeliveriesRoute, async (c) => {
    const { application, message_id } = c.req.valid("param");
    const message = await requireMessage(c, application, message_id);
    const rows = await listMessageDeliveries({ organizationId: message.organizationId, message });
    return c.json(
      { object: "list" as const, data: rows.map(toHookDeliveryObject), has_more: false },
      200,
    );
  });

  async function requireDelivery(c: { var: AppEnv["Variables"] }, ref: string, id: string) {
    const application = await requireApplication(c.var.auth, ref);
    const delivery = await getHookDelivery({
      organizationId: application.organizationId,
      applicationId: application.id,
      id,
    });
    if (!delivery) throw new HookError("not_found", "Delivery not found.");
    return delivery;
  }

  router.openapi(getHookDeliveryRoute, async (c) => {
    const { application, delivery_id } = c.req.valid("param");
    return c.json(toHookDeliveryObject(await requireDelivery(c, application, delivery_id)), 200);
  });

  router.openapi(listHookDeliveryAttemptsRoute, async (c) => {
    const { application, delivery_id } = c.req.valid("param");
    const delivery = await requireDelivery(c, application, delivery_id);
    const attempts = await listHookAttempts(delivery);
    return c.json(
      { object: "list" as const, data: attempts.map(toHookAttemptObject), has_more: false },
      200,
    );
  });

  router.openapi(retryHookDeliveryRoute, async (c) => {
    const { application: ref, delivery_id } = c.req.valid("param");
    const application = await requireApplication(c.var.auth, ref);
    const delivery = await retryHookDelivery({
      organizationId: application.organizationId,
      applicationId: application.id,
      id: delivery_id,
    });
    if (!delivery) throw new HookError("not_found", "Delivery not found.");
    await recordApiAudit(c, {
      action: "hook_delivery.retried",
      target: { type: "hook_delivery", id: delivery.id },
      metadata: { application_id: application.id, endpoint_id: delivery.endpointId },
    });
    return c.json(toHookDeliveryObject(delivery), 200);
  });

  router.openapi(createHookPortalSessionRoute, async (c) => {
    const application = await requireApplication(c.var.auth, c.req.valid("param").application);
    const body = c.req.valid("json");
    const portalUrl = opts.portalUrl;
    if (!portalUrl) {
      throw new ApiError(503, {
        type: "api_error",
        code: "portal_unavailable",
        message: "The Hooks portal isn't available yet.",
      });
    }
    const { session, token } = await createHookPortalSession({
      application,
      expiresIn: body.expires_in,
      readOnly: body.read_only,
      apiKeyId: c.var.auth.apiKeyId,
    });
    await recordApiAudit(c, {
      action: "hook_portal_session.created",
      target: {
        type: "hook_application",
        id: application.id,
        label: application.uid ?? application.name,
      },
      metadata: { session_id: session.id, read_only: session.readOnly },
    });
    return c.json(
      {
        object: "hook_portal_session" as const,
        id: session.id,
        application_id: application.id,
        url: portalSessionUrl(portalUrl, session.id, token),
        token,
        read_only: session.readOnly,
        expires_at: session.expiresAt.toISOString(),
      },
      200,
    );
  });

  return router;
}
