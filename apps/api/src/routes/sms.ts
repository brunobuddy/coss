import { smsRecipientQuota, smsSendQuota } from "@coss/ratelimit";
import {
  addSmsSuppression,
  cancelScheduledSms,
  checkSmsSuppression,
  getReceivedSms,
  getSms,
  getSmsSuppression,
  isTollFreeNumber,
  listReceivedSms,
  listSmsEvents,
  listSmsNumberObjects,
  listSmsPage,
  listSmsSuppressions,
  removeSmsSuppression,
  type SmsService,
} from "@coss/sms";
import {
  CheckSmsSuppressionQuery,
  CreateSmsSuppressionRequest,
  DeletedSmsSuppression,
  ListReceivedSmsQuery,
  ListSmsQuery,
  ListSmsSuppressionsQuery,
  ReceivedSmsList,
  ReceivedSmsObject,
  SendSmsRequest,
  SmsEventList,
  SmsList,
  SmsNumberList,
  SmsObject,
  SmsSuppression,
  SmsSuppressionCheck,
  SmsSuppressionList,
} from "@coss/sms/schemas";
import { countSegments } from "@coss/sms/segments";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";

const SendSmsHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "message (with its current status) instead of sending again, for 24 hours.",
);

const SmsIdParams = z.object({
  id: z
    .string()
    .meta({ description: "The message's id.", examples: ["sms_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const SuppressionIdParams = z.object({
  id: z.string().meta({
    description: "The entry's id.",
    examples: ["smssup_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const ReceivedIdParams = z.object({
  id: z.string().meta({
    description: "The received message's id.",
    examples: ["smsin_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const queryError = errorDoc(
  "A query parameter failed validation (`validation_error`, see `issues`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const sendSmsRoute = createRoute({
  method: "post",
  path: "/sms",
  operationId: "sendSms",
  tags: ["SMS"],
  summary: "Send an SMS",
  description:
    'Queues a text message from the API key\'s environment and returns it with `status: "queued"`; ' +
    "it is handed to the carrier moments later. Follow it with `GET /v1/sms/{id}` or the " +
    "`sms.sent`, `sms.delivered`, `sms.undelivered` and `sms.failed` webhooks. Live " +
    "(`coss_live_…`) keys send `from` one of the organization's numbers whose carrier " +
    "registration is approved, to the countries the organization allows (US and Canada unless " +
    "changed in the dashboard). Sandbox (`coss_test_…`) keys accept any `from`, deliver nothing " +
    "and answer the SMS simulator's numbers (`+15005550006` delivered, `+15005550001` invalid, " +
    "`+15005550004` filtered by the carrier, `+15005550009` opted out, `+15005550008` replies). " +
    "A number on the environment's SMS suppression list (it replied STOP, or it can't receive " +
    "SMS) is skipped: the message is `failed` with `suppressed`. Segments count against the " +
    "organization's send quota, and each is billed by the destination country.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sms: ["send"] }),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/sms"),
  ] as const,
  request: {
    headers: SendSmsHeaders,
    body: { required: true, content: { "application/json": { schema: SendSmsRequest } } },
  },
  responses: {
    202: {
      description:
        "The message, accepted (`queued` or `scheduled`; `failed` when its number is suppressed). " +
        "A replay returns the original message with its current status.",
      headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
      content: { "application/json": { schema: SmsObject } },
    },
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    402: billingErrorDoc(
      "Live sending is paused for an overdue invoice or the spend limit (`billing_hold`) or a used-up budget (`budget_exceeded`), the plan doesn't include SMS or the destination country isn't priced (`plan_feature_unavailable`)",
    ),
    ...commonErrors,
    403: errorDoc(
      "The API key lacks the permission this endpoint needs (`insufficient_permissions`), its " +
        "organization is suspended (`organization_suspended`), or live sending is suspended " +
        "(`account_suspended`).",
    ),
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing for an expired key (`request_in_progress`).",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    413: bodyErrors[413],
    415: bodyErrors[415],
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), `to` isn't a valid number " +
        "(`invalid_phone_number`), `from` isn't one of the organization's numbers " +
        "(`sender_not_found`) or can't send yet (`sender_not_ready`), the destination country " +
        "isn't allowed (`country_not_allowed`), or the `Idempotency-Key` was already used with a " +
        "different body (`idempotency_key_reused`).",
    ),
    429: errorDoc(
      "Too many requests with this API key (`rate_limited`), or the message's segments exceed " +
        "the send quota or too many messages went to this number in the last hour " +
        "(`quota_exceeded`). Retry after `Retry-After` seconds.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
  },
});

export const listSmsRoute = createRoute({
  method: "get",
  path: "/sms",
  operationId: "listSms",
  tags: ["SMS"],
  summary: "List SMS",
  description:
    "Messages sent from the API key's environment, newest first. Pass the last `id` as `after` " +
    "to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  request: { query: ListSmsQuery },
  responses: {
    200: jsonDoc("A page of messages.", SmsList),
    ...commonErrors,
    422: queryError,
  },
});

export const getSmsRoute = createRoute({
  method: "get",
  path: "/sms/{id}",
  operationId: "getSms",
  tags: ["SMS"],
  summary: "Retrieve an SMS",
  description: "One message sent from the API key's environment, with its current status.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  request: { params: SmsIdParams },
  responses: {
    200: jsonDoc("The message.", SmsObject),
    ...commonErrors,
    404: errorDoc("No message with this id exists in the API key's environment (`not_found`)."),
  },
});

export const listSmsEventsRoute = createRoute({
  method: "get",
  path: "/sms/{id}/events",
  operationId: "listSmsEvents",
  tags: ["SMS"],
  summary: "List an SMS's events",
  description: "Everything that happened to the message, oldest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  request: { params: SmsIdParams },
  responses: {
    200: jsonDoc("The events.", SmsEventList),
    ...commonErrors,
    404: errorDoc("No message with this id exists in the API key's environment (`not_found`)."),
  },
});

export const cancelSmsRoute = createRoute({
  method: "post",
  path: "/sms/{id}/cancel",
  operationId: "cancelSms",
  tags: ["SMS"],
  summary: "Cancel a scheduled SMS",
  description:
    "Cancels a message scheduled with `scheduled_at` before it is sent. Canceling a canceled " +
    "message returns it as is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["send"] }), rateLimit("api.write")],
  request: { params: SmsIdParams },
  responses: {
    200: jsonDoc("The canceled message.", SmsObject),
    ...commonErrors,
    404: errorDoc("No message with this id exists in the API key's environment (`not_found`)."),
    422: errorDoc("The message isn't scheduled (`sms_not_cancelable`)."),
  },
});

export const createSmsSuppressionRoute = createRoute({
  method: "post",
  path: "/sms/suppressions",
  operationId: "createSmsSuppression",
  tags: ["SMS"],
  summary: "Add a number to the SMS suppression list",
  description:
    "Later sends from the API key's environment to the number are skipped. Adding a number " +
    "already on the list returns its entry with status 200.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ smsSuppression: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sms/suppressions"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateSmsSuppressionRequest } },
    },
  },
  responses: {
    200: jsonDoc("The number already had an entry.", SmsSuppression),
    201: jsonDoc("The new entry.", SmsSuppression),
    ...bodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`) or the number isn't valid (`invalid_phone_number`).",
    ),
  },
});

export const listSmsSuppressionsRoute = createRoute({
  method: "get",
  path: "/sms/suppressions",
  operationId: "listSmsSuppressions",
  tags: ["SMS"],
  summary: "List suppressed numbers",
  description:
    "The SMS suppression list of the API key's environment, newest first: opt-outs, invalid " +
    "numbers and numbers you added.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ smsSuppression: ["read"] }), rateLimit("api.read")],
  request: { query: ListSmsSuppressionsQuery },
  responses: {
    200: jsonDoc("A page of entries.", SmsSuppressionList),
    ...commonErrors,
    422: queryError,
  },
});

export const checkSmsSuppressionRoute = createRoute({
  method: "get",
  path: "/sms/suppressions/check",
  operationId: "checkSmsSuppression",
  tags: ["SMS"],
  summary: "Check whether a number is suppressed",
  description:
    "Whether a phone number is on the SMS suppression list of the API key's environment, with its entry if it is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ smsSuppression: ["read"] }), rateLimit("api.read")],
  request: { query: CheckSmsSuppressionQuery },
  responses: {
    200: jsonDoc("The result.", SmsSuppressionCheck),
    ...commonErrors,
    422: queryError,
  },
});

export const getSmsSuppressionRoute = createRoute({
  method: "get",
  path: "/sms/suppressions/{id}",
  operationId: "getSmsSuppression",
  tags: ["SMS"],
  summary: "Retrieve an SMS suppression",
  description: "One entry of the SMS suppression list of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ smsSuppression: ["read"] }), rateLimit("api.read")],
  request: { params: SuppressionIdParams },
  responses: {
    200: jsonDoc("The entry.", SmsSuppression),
    ...commonErrors,
    404: errorDoc("No entry with this id exists in the API key's environment (`not_found`)."),
  },
});

export const deleteSmsSuppressionRoute = createRoute({
  method: "delete",
  path: "/sms/suppressions/{id}",
  operationId: "deleteSmsSuppression",
  tags: ["SMS"],
  summary: "Remove a number from the SMS suppression list",
  description:
    "Sends to the number go out again. Remove an opt-out only when the person asked to receive " +
    "messages again (they can also reply START).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ smsSuppression: ["delete"] }), rateLimit("api.write")],
  request: { params: SuppressionIdParams },
  responses: {
    200: jsonDoc("The entry was removed.", DeletedSmsSuppression),
    ...commonErrors,
    404: errorDoc("No entry with this id exists in the API key's environment (`not_found`)."),
  },
});

export const listReceivedSmsRoute = createRoute({
  method: "get",
  path: "/sms/received",
  operationId: "listReceivedSms",
  tags: ["SMS"],
  summary: "List received SMS",
  description:
    "Messages sent to the organization's numbers whose replies go to the API key's environment, " +
    "newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  request: { query: ListReceivedSmsQuery },
  responses: {
    200: jsonDoc("A page of received messages.", ReceivedSmsList),
    ...commonErrors,
    422: queryError,
  },
});

export const getReceivedSmsRoute = createRoute({
  method: "get",
  path: "/sms/received/{id}",
  operationId: "getReceivedSms",
  tags: ["SMS"],
  summary: "Retrieve a received SMS",
  description:
    "One message received on a number of the organization and routed to the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  request: { params: ReceivedIdParams },
  responses: {
    200: jsonDoc("The received message.", ReceivedSmsObject),
    ...commonErrors,
    404: errorDoc(
      "No received message with this id exists in the API key's environment (`not_found`).",
    ),
  },
});

export const listSmsNumbersRoute = createRoute({
  method: "get",
  path: "/sms/numbers",
  operationId: "listSmsNumbers",
  tags: ["SMS"],
  summary: "List the organization's phone numbers",
  description:
    "Every number of the organization, whether it can send live messages now (its carrier " +
    "registration is approved) and whether its replies arrive in the API key's environment. " +
    "Numbers are bought and registered in the dashboard.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sms: ["read"] }), rateLimit("api.read")],
  responses: {
    200: jsonDoc("The numbers.", SmsNumberList),
    ...commonErrors,
  },
});

function createdBetween(query: { created_after?: string; created_before?: string }) {
  return {
    createdAfter: query.created_after ? new Date(query.created_after) : undefined,
    createdBefore: query.created_before ? new Date(query.created_before) : undefined,
  };
}

export function createSmsRoutes(smsService: SmsService): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    sendSmsRoute,
    async (c) => {
      const params = c.req.valid("json");
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { apiKeyId, ownerUserId, organizationId, projectId, environmentId, mode } = c.var.auth;
      // Tenancy always comes from the authenticated key, never from the request.
      const input = {
        environment: { organizationId, projectId, environmentId, mode },
        apiKeyId,
        apiKeyOwnerId: ownerUserId,
        params,
        idempotencyKey,
        traceparent: c.var.traceparent,
      };
      // Counted as the service counts them (toll-free numbers' segments are smaller).
      const segments = countSegments(params.body, { tollFree: isTollFreeNumber(params.from) });
      const quotas = [smsSendQuota(c.var.auth, segments.segments)];
      if (mode === "live") quotas.push(smsRecipientQuota(c.var.auth, params.to));
      const charged: typeof quotas = [];
      for (const quota of quotas) {
        const decision = await c.var.rateLimiter.consume(quota);
        if (decision.allowed) {
          charged.push(quota);
          continue;
        }
        for (const done of charged) await c.var.rateLimiter.refund(done);
        // A matching replay needs no quota. This lookup cannot create or dispatch a send.
        const replay = await smsService.replay(input);
        if (replay) {
          c.header("Idempotent-Replayed", "true");
          return c.json(replay, 202);
        }
        throw rateLimitError(decision, {
          code: "quota_exceeded",
          message:
            decision.bucket === "sms.recipient.hour"
              ? "Too many messages to this number in the last hour. Retry after `Retry-After` seconds."
              : `The SMS quota (${decision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
        });
      }
      let result: Awaited<ReturnType<SmsService["send"]>>;
      try {
        result = await smsService.send(input);
      } catch (error) {
        for (const quota of charged) await c.var.rateLimiter.refund(quota);
        throw error;
      }
      if (result.replayed) {
        for (const quota of charged) await c.var.rateLimiter.refund(quota);
        c.header("Idempotent-Replayed", "true");
      }
      return c.json(result.sms, 202);
    },
    // A bad Idempotency-Key is a 400, not a 422.
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listSmsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listSmsPage({
      organizationId,
      environmentId,
      to: query.to,
      status: query.status,
      ...createdBetween(query),
      limit: query.limit,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  // Static paths before `/sms/{id}`, which would otherwise match them.
  router.openapi(createSmsSuppressionRoute, async (c) => {
    const { phone_number } = c.req.valid("json");
    const { organizationId, projectId, environmentId } = c.var.auth;
    const result = await addSmsSuppression(
      { organizationId, projectId, environmentId },
      phone_number,
    );
    if (!result.created) return c.json(result.suppression, 200);
    await recordApiAudit(c, {
      action: "sms_suppression.created",
      target: {
        type: "sms_suppression",
        id: result.suppression.id,
        label: result.suppression.phone_number,
      },
    });
    return c.json(result.suppression, 201);
  });

  router.openapi(listSmsSuppressionsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listSmsSuppressions({
      organizationId,
      environmentId,
      phoneNumber: query.phone_number,
      limit: query.limit,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(checkSmsSuppressionRoute, async (c) => {
    const { phone_number } = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(
      await checkSmsSuppression({ organizationId, environmentId, phoneNumber: phone_number }),
      200,
    );
  });

  router.openapi(getSmsSuppressionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getSmsSuppression({ organizationId, environmentId, id }), 200);
  });

  router.openapi(deleteSmsSuppressionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const removed = await removeSmsSuppression({ organizationId, environmentId, id });
    await recordApiAudit(c, {
      action: "sms_suppression.deleted",
      target: { type: "sms_suppression", id, label: removed.phone_number },
    });
    return c.json({ object: "sms_suppression" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listReceivedSmsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await listReceivedSms({
      organizationId,
      environmentId,
      from: query.from,
      to: query.to,
      ...createdBetween(query),
      limit: query.limit,
      after: query.after,
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getReceivedSmsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getReceivedSms({ organizationId, environmentId, id }), 200);
  });

  router.openapi(listSmsNumbersRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    const data = await listSmsNumberObjects({ organizationId, environmentId });
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(getSmsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await getSms({ organizationId, environmentId, smsId: id }), 200);
  });

  router.openapi(listSmsEventsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const data = await listSmsEvents({ organizationId, environmentId, smsId: id });
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(cancelSmsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const sms = await cancelScheduledSms({ organizationId, environmentId, smsId: id });
    await recordApiAudit(c, { action: "sms.canceled", target: { type: "sms", id } });
    return c.json(sms, 200);
  });

  return router;
}
