import type { UsageGate } from "@coss/billing/gate";
import {
  cancelBroadcast,
  createBroadcast,
  deleteBroadcast,
  type EmailService,
  getBroadcast,
  listBroadcastEmails,
  listBroadcasts,
  pauseBroadcast,
  resumeBroadcast,
  sendBroadcast,
  testBroadcast,
  testRecipients,
  updateBroadcast,
} from "@coss/email";
import {
  Broadcast,
  BroadcastList,
  BroadcastTest,
  CreateBroadcastRequest,
  DeletedBroadcast,
  ListBroadcastsQuery,
  SendBroadcastRequest,
  TestBroadcastRequest,
  UpdateBroadcastRequest,
} from "@coss/email/broadcast-schemas";
import { EmailObject } from "@coss/email/schemas";
import { emailSendQuota } from "@coss/ratelimit";
import { apiKeyHasPermissions } from "@coss/tenancy";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { ApiError, notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";

const BroadcastParams = z.object({
  id: z.string().meta({
    description: "The broadcast's id.",
    examples: ["bcast_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const CreateBroadcastHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the broadcast " +
    "created first instead of creating another, for 24 hours.",
);

const BroadcastEmailsQuery = z.strictObject({
  limit: ListBroadcastsQuery.shape.limit,
  after: z
    .string()
    .optional()
    .meta({ description: "Cursor: the `id` of the last email of the previous page." }),
});

const BroadcastEmailList = z
  .object({ object: z.literal("list"), data: z.array(EmailObject), has_more: z.boolean() })
  .meta({ id: "BroadcastEmailList" });

const notFoundDoc = errorDoc(
  "No broadcast with this id exists in the API key's environment (`not_found`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const listBroadcastsRoute = createRoute({
  method: "get",
  path: "/broadcasts",
  operationId: "listBroadcasts",
  tags: ["Broadcasts"],
  summary: "List broadcasts",
  description: "The API key's environment's broadcasts, newest first, with their stats.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ broadcast: ["read"] }), rateLimit("api.read")],
  request: { query: ListBroadcastsQuery },
  responses: {
    200: jsonDoc("A page of broadcasts.", BroadcastList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const createBroadcastRoute = createRoute({
  method: "post",
  path: "/broadcasts",
  operationId: "createBroadcast",
  tags: ["Broadcasts"],
  summary: "Create a broadcast",
  description:
    "Creates a draft, or with `send` or `scheduled_at` a broadcast that starts sending (so it " +
    "needs `broadcast:send` too). A broadcast goes to every contact of its audience or segment " +
    "who is subscribed, reached by its topic and not suppressed, as one email each, at the " +
    "plan's marketing rate.",
  security: [{ bearerAuth: [] }],
  middleware: [
    // `broadcast:send` only for a broadcast that starts (checked in the handler).
    requireApiKey({ broadcast: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/broadcasts"),
  ],
  request: {
    headers: CreateBroadcastHeaders,
    body: { required: true, content: { "application/json": { schema: CreateBroadcastRequest } } },
  },
  responses: {
    201: {
      ...jsonDoc("The new broadcast.", Broadcast),
      headers: { "Idempotent-Replayed": idempotentReplayedHeader },
    },
    ...bodyErrors,
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing (`request_in_progress`); retry.",
    ),
    422: errorDoc(
      "The body failed validation, the audience, segment or topic doesn't exist " +
        "(`invalid_target`, `topic_not_found`), its content could render too long " +
        "(`content_too_large`), the `Idempotency-Key` was used with another " +
        "body (`idempotency_key_reused`), or it can't start (see `POST …/send`).",
    ),
  },
});

export const getBroadcastRoute = createRoute({
  method: "get",
  path: "/broadcasts/{id}",
  operationId: "getBroadcast",
  tags: ["Broadcasts"],
  summary: "Retrieve a broadcast",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ broadcast: ["read"] }), rateLimit("api.read")],
  request: { params: BroadcastParams },
  responses: { 200: jsonDoc("The broadcast.", Broadcast), ...commonErrors, 404: notFoundDoc },
});

export const updateBroadcastRoute = createRoute({
  method: "patch",
  path: "/broadcasts/{id}",
  operationId: "updateBroadcast",
  tags: ["Broadcasts"],
  summary: "Update a draft broadcast",
  description: "Changes a draft; fields left out keep their value, `null` clears one.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ broadcast: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/broadcasts/{id}"),
  ],
  request: {
    params: BroadcastParams,
    body: { required: true, content: { "application/json": { schema: UpdateBroadcastRequest } } },
  },
  responses: {
    200: jsonDoc("The broadcast.", Broadcast),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc(
      "The body failed validation, the broadcast isn't a draft (`broadcast_not_editable`), or its " +
        "content could render too long (`content_too_large`).",
    ),
  },
});

export const deleteBroadcastRoute = createRoute({
  method: "delete",
  path: "/broadcasts/{id}",
  operationId: "deleteBroadcast",
  tags: ["Broadcasts"],
  summary: "Delete a broadcast",
  description: "Deletes a draft, or a broadcast canceled before any of its emails were made.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ broadcast: ["delete"] }), rateLimit("api.write")],
  request: { params: BroadcastParams },
  responses: {
    200: jsonDoc("The broadcast was deleted.", DeletedBroadcast),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The broadcast has sent emails (`broadcast_not_editable`): cancel it instead."),
  },
});

function actionRoute(
  action: "send" | "cancel" | "pause" | "resume",
  opts: { summary: string; description: string; body?: boolean; errors: string },
) {
  return createRoute({
    method: "post",
    path: `/broadcasts/{id}/${action}`,
    operationId: `${action}Broadcast`,
    tags: ["Broadcasts"],
    summary: opts.summary,
    description: opts.description,
    security: [{ bearerAuth: [] }],
    middleware: [
      requireApiKey({ broadcast: ["send"] }),
      rateLimit("api.write"),
      ...(opts.body ? [upgradeRequestBody(`POST /v1/broadcasts/{id}/${action}`)] : []),
    ],
    request: {
      params: BroadcastParams,
      ...(opts.body
        ? {
            body: {
              required: false,
              content: { "application/json": { schema: SendBroadcastRequest } },
            },
          }
        : {}),
    },
    responses: {
      200: jsonDoc("The broadcast.", Broadcast),
      ...(opts.body ? bodyErrors : {}),
      ...commonErrors,
      404: notFoundDoc,
      422: errorDoc(opts.errors),
    },
  });
}

export const sendBroadcastRoute = actionRoute("send", {
  summary: "Send a broadcast",
  description:
    "Starts sending a draft, now or at `scheduled_at`. Sending a broadcast that already " +
    "started returns it as it is.",
  body: true,
  errors:
    "The broadcast can't start: no postal address (`mailing_address_required`), an " +
    "unverified From domain (`domain_not_verified`), marketing paused (`marketing_paused`), or " +
    "it already ended (`broadcast_not_sendable`).",
});
export const cancelBroadcastRoute = actionRoute("cancel", {
  summary: "Cancel a broadcast",
  description:
    "Stops it for good: its emails not yet handed to the provider are dropped (the ones on " +
    "their way still go). Canceling a canceled broadcast returns it.",
  errors: "The broadcast already ended (`broadcast_not_sendable`).",
});
export const pauseBroadcastRoute = actionRoute("pause", {
  summary: "Pause a broadcast",
  description:
    "Pauses a scheduled or sending broadcast; emails not yet handed to the provider are " +
    "dropped and made again when it is resumed.",
  errors: "The broadcast isn't scheduled or sending (`broadcast_not_sendable`).",
});
export const resumeBroadcastRoute = actionRoute("resume", {
  summary: "Resume a broadcast",
  description: "Resumes a paused broadcast where it stopped.",
  errors:
    "The broadcast isn't paused (`broadcast_not_sendable`), or it still can't send (see " +
    "`POST …/send`).",
});

export const testBroadcastRoute = createRoute({
  method: "post",
  path: "/broadcasts/{id}/test",
  operationId: "testBroadcast",
  tags: ["Broadcasts"],
  summary: "Send a test of a broadcast",
  description:
    "Sends its content to up to 5 addresses as ordinary marketing emails (subject prefixed " +
    "`[Test]`), filled with `contact`'s values or the fallbacks. They count like any send.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ broadcast: ["send"], email: ["send"] }),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/broadcasts/{id}/test"),
  ],
  request: {
    params: BroadcastParams,
    body: { required: true, content: { "application/json": { schema: TestBroadcastRequest } } },
  },
  responses: {
    200: jsonDoc("The test emails.", BroadcastTest),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    429: errorDoc(
      "The API key's send rate limit (`rate_limited`) or the send quota (`quota_exceeded`) is used up.",
    ),
    422: errorDoc(
      "The body failed validation, or the emails can't be sent (e.g. `mailing_address_required`, " +
        "`domain_not_verified`).",
    ),
  },
});

export const listBroadcastEmailsRoute = createRoute({
  method: "get",
  path: "/broadcasts/{id}/emails",
  operationId: "listBroadcastEmails",
  tags: ["Broadcasts"],
  summary: "List a broadcast's emails",
  description: "The emails made so far, one per contact, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ broadcast: ["read"], email: ["read"] }), rateLimit("api.read")],
  request: { params: BroadcastParams, query: BroadcastEmailsQuery },
  responses: {
    200: jsonDoc("A page of emails.", BroadcastEmailList),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

const NOT_FOUND = "No broadcast with this id exists in this API key's environment.";

export type BroadcastRouteDeps = {
  /** Test sends go through the normal send path. */
  emailService: Pick<EmailService, "send">;
  /** The live provider: live broadcasts come from a domain it verified. */
  liveProvider: string;
  billing?: UsageGate;
};

export function createBroadcastRoutes(deps: BroadcastRouteDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const envOf = (c: { var: AppEnv["Variables"] }) => {
    const { organizationId, projectId, environmentId, mode, apiKeyId, ownerUserId } = c.var.auth;
    return { organizationId, projectId, environmentId, mode, apiKeyId, apiKeyOwnerId: ownerUserId };
  };
  const audit = (c: Context<AppEnv>, action: string, broadcast: { id: string; name?: string }) =>
    recordApiAudit(c, {
      action,
      target: { type: "broadcast", id: broadcast.id, label: broadcast.name ?? null },
    });

  router.openapi(listBroadcastsRoute, async (c) =>
    c.json(await listBroadcasts(envOf(c), c.req.valid("query")), 200),
  );

  router.openapi(
    createBroadcastRoute,
    async (c) => {
      const params = c.req.valid("json");
      const starts = params.send === true || params.scheduled_at !== undefined;
      if (starts && !(await apiKeyHasPermissions(c.var.auth.apiKeyId, { broadcast: ["send"] }))) {
        throw new ApiError(403, {
          type: "permission_error",
          code: "insufficient_permissions",
          message:
            "Starting a broadcast (`send` or `scheduled_at`) needs the broadcast:send permission.",
        });
      }
      const { broadcast, replayed } = await createBroadcast(envOf(c), params, {
        liveProvider: deps.liveProvider,
        idempotencyKey: c.req.valid("header")["Idempotency-Key"],
      });
      if (replayed) c.header("Idempotent-Replayed", "true");
      else await audit(c, "broadcast.created", broadcast);
      return c.json(broadcast, 201);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(getBroadcastRoute, async (c) => {
    const broadcast = await getBroadcast(envOf(c), c.req.valid("param").id);
    if (!broadcast) throw notFound(NOT_FOUND);
    return c.json(broadcast, 200);
  });

  router.openapi(updateBroadcastRoute, async (c) => {
    const broadcast = await updateBroadcast(envOf(c), c.req.valid("param").id, c.req.valid("json"));
    if (!broadcast) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.updated", broadcast);
    return c.json(broadcast, 200);
  });

  router.openapi(deleteBroadcastRoute, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deleteBroadcast(envOf(c), id))) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.deleted", { id });
    return c.json({ object: "broadcast" as const, id, deleted: true as const }, 200);
  });

  router.openapi(sendBroadcastRoute, async (c) => {
    const body = (c.req.valid("json" as never) ?? {}) as { scheduled_at?: string };
    const broadcast = await sendBroadcast(envOf(c), c.req.valid("param").id, {
      scheduledAt: body.scheduled_at ? new Date(body.scheduled_at) : null,
      liveProvider: deps.liveProvider,
    });
    if (!broadcast) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.sent", broadcast);
    return c.json(broadcast, 200);
  });

  router.openapi(cancelBroadcastRoute, async (c) => {
    const broadcast = await cancelBroadcast(envOf(c), c.req.valid("param").id, {
      billing: deps.billing,
    });
    if (!broadcast) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.canceled", broadcast);
    return c.json(broadcast, 200);
  });

  router.openapi(pauseBroadcastRoute, async (c) => {
    const broadcast = await pauseBroadcast(envOf(c), c.req.valid("param").id, {
      billing: deps.billing,
    });
    if (!broadcast) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.paused", broadcast);
    return c.json(broadcast, 200);
  });

  router.openapi(resumeBroadcastRoute, async (c) => {
    const broadcast = await resumeBroadcast(envOf(c), c.req.valid("param").id, {
      liveProvider: deps.liveProvider,
    });
    if (!broadcast) throw notFound(NOT_FOUND);
    await audit(c, "broadcast.resumed", broadcast);
    return c.json(broadcast, 200);
  });

  router.openapi(testBroadcastRoute, async (c) => {
    const body = c.req.valid("json");
    // Test emails are sends: they count against the send quota like any other, one each.
    const count = testRecipients(body.to).length;
    const decision = await c.var.rateLimiter.consume(emailSendQuota(c.var.auth, count));
    if (!decision.allowed) {
      throw rateLimitError(decision, {
        code: "quota_exceeded",
        message: `The send quota (${decision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
      });
    }
    // Each email is its own send: what was accepted before a failure stays charged.
    let sent = 0;
    const refundUnsent = async () => {
      if (sent < count) await c.var.rateLimiter.refund(emailSendQuota(c.var.auth, count - sent));
    };
    let ids: string[] | null;
    try {
      ids = await testBroadcast(envOf(c), c.req.valid("param").id, body, {
        ...deps,
        onSent: () => {
          sent++;
        },
      });
    } catch (error) {
      await refundUnsent();
      throw error;
    }
    if (!ids) {
      await refundUnsent();
      throw notFound(NOT_FOUND);
    }
    return c.json({ object: "broadcast_test" as const, email_ids: ids }, 200);
  });

  router.openapi(listBroadcastEmailsRoute, async (c) => {
    const page = await listBroadcastEmails(envOf(c), c.req.valid("param").id, c.req.valid("query"));
    if (!page) throw notFound(NOT_FOUND);
    return c.json(page, 200);
  });

  return router;
}
