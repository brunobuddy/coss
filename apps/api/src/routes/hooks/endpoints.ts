import {
  createHookEndpoint,
  deleteHookEndpoint,
  getHookEndpoint,
  getHookEndpointRecovery,
  getHookEventType,
  HookError,
  type HookManagementDeps,
  listHookEndpoints,
  MAX_ENDPOINTS,
  pageHookDeliveries,
  recoverHookEndpoint,
  revealHookEndpointSecret,
  rollHookEndpointSecret,
  sendHookMessage,
  toHookDeliveryObject,
  toHookEndpointObject,
  toHookEndpointRecoveryObject,
  toHookMessageObject,
  updateHookEndpoint,
} from "@coss/hooks";
import {
  CreateHookEndpointRequest,
  DeletedHookEndpoint,
  HookDeliveryList,
  HookEndpointList,
  HookEndpointObject,
  HookEndpointRecoveryObject,
  HookEndpointSecret,
  HookEndpointWithSecret,
  HookMessageObject,
  ListHookDeliveriesQuery,
  RecoverHookEndpointRequest,
  RollHookEndpointSecretRequest,
  SendHookTestRequest,
  UpdateHookEndpointRequest,
} from "@coss/hooks/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../../audit.ts";
import { requireApiKey } from "../../middleware/api-key.ts";
import { upgradeRequestBody } from "../../middleware/api-version.ts";
import { rateLimit } from "../../middleware/rate-limit.ts";
import type { AppEnv } from "../../types.ts";
import { commonErrors, errorDoc, jsonDoc } from "../docs.ts";
import { chargeSendQuota, refundSendQuota } from "./quota.ts";
import { ApplicationParams, bodyErrors, requireApplication, SCOPE_NOTE, TAGS } from "./shared.ts";

const EndpointParams = ApplicationParams.extend({
  endpoint_id: z.string().meta({
    description: "The endpoint's id.",
    examples: ["hep_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const RecoveryParams = EndpointParams.extend({
  recovery_id: z.string().meta({ examples: ["hrec_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const notFound = errorDoc(
  "No such application, or no endpoint with this id in it (`application_not_found`, `not_found`).",
);

const PATH = "/hooks/applications/{application}/endpoints";

export const createHookEndpointRoute = createRoute({
  method: "post",
  path: PATH,
  operationId: "createHookEndpoint",
  tags: [TAGS.endpoints],
  summary: "Create an endpoint",
  description:
    "Registers a URL of the application's user that receives its messages, each request signed " +
    "(Standard Webhooks) with the endpoint's own secret, returned here. Usually your users add " +
    `endpoints themselves in the portal. ${SCOPE_NOTE}`,
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/hooks/applications/{application}/endpoints"),
  ],
  request: {
    params: ApplicationParams,
    body: {
      required: true,
      content: { "application/json": { schema: CreateHookEndpointRequest } },
    },
  },
  responses: {
    200: jsonDoc("The endpoint and its signing secret.", HookEndpointWithSecret),
    ...bodyErrors,
    ...commonErrors,
    404: notFound,
    422: errorDoc(
      "The body failed validation (`validation_error`), the URL is not a usable https:// URL " +
        "(`invalid_url`), a filter type is unknown or archived (`unknown_event_type`), the secret " +
        "is malformed (`invalid_secret`), or the application has the most endpoints it can " +
        `(${MAX_ENDPOINTS.live} live, ${MAX_ENDPOINTS.sandbox} sandbox: \`too_many_endpoints\`).`,
    ),
  },
});

export const listHookEndpointsRoute = createRoute({
  method: "get",
  path: PATH,
  operationId: "listHookEndpoints",
  tags: [TAGS.endpoints],
  summary: "List endpoints",
  description: "The application's endpoints, oldest first. Secrets are never included.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: ApplicationParams },
  responses: {
    200: jsonDoc("The application's endpoints.", HookEndpointList),
    ...commonErrors,
    404: notFound,
  },
});

export const getHookEndpointRoute = createRoute({
  method: "get",
  path: `${PATH}/{endpoint_id}`,
  operationId: "getHookEndpoint",
  tags: [TAGS.endpoints],
  summary: "Retrieve an endpoint",
  description: "An endpoint of the application.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: EndpointParams },
  responses: {
    200: jsonDoc("The endpoint.", HookEndpointObject),
    ...commonErrors,
    404: notFound,
  },
});

export const updateHookEndpointRoute = createRoute({
  method: "patch",
  path: `${PATH}/{endpoint_id}`,
  operationId: "updateHookEndpoint",
  tags: [TAGS.endpoints],
  summary: "Update an endpoint",
  description:
    "Changes the URL, description, filter types, rate limit, metadata or `enabled`. Enabling it " +
    "again clears a failure streak. The secret stays the same (see roll secret).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/hooks/applications/{application}/endpoints/{endpoint_id}"),
  ],
  request: {
    params: EndpointParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateHookEndpointRequest } },
    },
  },
  responses: {
    200: jsonDoc("The endpoint.", HookEndpointObject),
    ...bodyErrors,
    ...commonErrors,
    404: notFound,
    422: errorDoc(
      "The body failed validation (`validation_error`, `invalid_url`, `unknown_event_type`).",
    ),
  },
});

export const deleteHookEndpointRoute = createRoute({
  method: "delete",
  path: `${PATH}/{endpoint_id}`,
  operationId: "deleteHookEndpoint",
  tags: [TAGS.endpoints],
  summary: "Delete an endpoint",
  description: "Deletes the endpoint; its pending deliveries fail. Its delivery log stays.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["delete"] }), rateLimit("api.write")],
  request: { params: EndpointParams },
  responses: {
    200: jsonDoc("The endpoint was deleted.", DeletedHookEndpoint),
    ...commonErrors,
    404: notFound,
  },
});

export const getHookEndpointSecretRoute = createRoute({
  method: "get",
  path: `${PATH}/{endpoint_id}/secret`,
  operationId: "getHookEndpointSecret",
  tags: [TAGS.endpoints],
  summary: "Retrieve an endpoint's secret",
  description:
    "The endpoint's current signing secret, e.g. to show its user. Needs `hook:update`, like rolling it.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["update"] }), rateLimit("api.read")],
  request: { params: EndpointParams },
  responses: {
    200: jsonDoc("The signing secret.", HookEndpointSecret),
    ...commonErrors,
    404: notFound,
  },
});

export const rollHookEndpointSecretRoute = createRoute({
  method: "post",
  path: `${PATH}/{endpoint_id}/roll_secret`,
  operationId: "rollHookEndpointSecret",
  tags: [TAGS.endpoints],
  summary: "Roll an endpoint's secret",
  description:
    "Replaces the signing secret, returned here. Until `previous_secret_expires_at`, requests carry " +
    "a signature with each secret, so the receiver can switch without rejecting any. Not idempotent.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody(
      "POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/roll_secret",
    ),
  ],
  request: {
    params: EndpointParams,
    body: {
      required: true,
      content: { "application/json": { schema: RollHookEndpointSecretRequest } },
    },
  },
  responses: {
    200: jsonDoc("The endpoint and its new secret.", HookEndpointWithSecret),
    ...bodyErrors,
    ...commonErrors,
    404: notFound,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

export const recoverHookEndpointRoute = createRoute({
  method: "post",
  path: `${PATH}/{endpoint_id}/recover`,
  operationId: "recoverHookEndpoint",
  tags: [TAGS.endpoints],
  summary: "Recover failed deliveries",
  description:
    "Queues every delivery to the endpoint that failed, of messages sent since `since`, for one " +
    "more attempt each, e.g. after its receiver was down. coss.com works through them in the " +
    "background (oldest first); follow `status` with the returned recovery. The endpoint must be enabled.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/recover"),
  ],
  request: {
    params: EndpointParams,
    body: {
      required: true,
      content: { "application/json": { schema: RecoverHookEndpointRequest } },
    },
  },
  responses: {
    200: jsonDoc("The recovery.", HookEndpointRecoveryObject),
    ...bodyErrors,
    ...commonErrors,
    404: notFound,
    422: errorDoc(
      "The body failed validation (`validation_error`) or the endpoint is disabled (`endpoint_disabled`).",
    ),
  },
});

export const getHookEndpointRecoveryRoute = createRoute({
  method: "get",
  path: `${PATH}/{endpoint_id}/recoveries/{recovery_id}`,
  operationId: "getHookEndpointRecovery",
  tags: [TAGS.endpoints],
  summary: "Retrieve a recovery",
  description: "A recovery of the endpoint: `pending` while deliveries are still being requeued.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: RecoveryParams },
  responses: {
    200: jsonDoc("The recovery.", HookEndpointRecoveryObject),
    ...commonErrors,
    404: notFound,
  },
});

export const sendHookEndpointTestRoute = createRoute({
  method: "post",
  path: `${PATH}/{endpoint_id}/test`,
  operationId: "sendHookEndpointTest",
  tags: [TAGS.endpoints],
  summary: "Send a test message",
  description:
    "Sends a message to this endpoint only (whatever its filter), with the given payload or the " +
    "event type's first example. It counts against the send quota like any message.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ hook: ["send"] }),
    rateLimit("api.send"),
    upgradeRequestBody("POST /v1/hooks/applications/{application}/endpoints/{endpoint_id}/test"),
  ],
  request: {
    params: EndpointParams,
    body: { required: true, content: { "application/json": { schema: SendHookTestRequest } } },
  },
  responses: {
    202: jsonDoc("The test message, queued.", HookMessageObject),
    ...bodyErrors,
    ...commonErrors,
    402: errorDoc(
      "An invoice is overdue or the spend or credit limit was reached (`billing_hold`).",
    ),
    404: notFound,
    422: errorDoc("The body failed validation (`validation_error`, `payload_too_large`)."),
  },
});

export const listHookEndpointDeliveriesRoute = createRoute({
  method: "get",
  path: `${PATH}/{endpoint_id}/deliveries`,
  operationId: "listHookEndpointDeliveries",
  tags: [TAGS.endpoints],
  summary: "List an endpoint's deliveries",
  description: "The endpoint's deliveries, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ hook: ["read"] }), rateLimit("api.read")],
  request: { params: EndpointParams, query: ListHookDeliveriesQuery },
  responses: {
    200: jsonDoc("A page of deliveries.", HookDeliveryList),
    ...commonErrors,
    404: notFound,
  },
});

export function createHookEndpointRoutes(deps: HookManagementDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  async function requireEndpoint(auth: AppEnv["Variables"]["auth"], ref: string, id: string) {
    const application = await requireApplication(auth, ref);
    const endpoint = await getHookEndpoint({
      organizationId: application.organizationId,
      applicationId: application.id,
      id,
    });
    if (!endpoint) throw new HookError("not_found", "Endpoint not found.");
    return { application, endpoint };
  }

  const audit = (
    c: Parameters<typeof recordApiAudit>[0],
    action: string,
    endpoint: { id: string; url: string; applicationId: string },
    metadata?: Record<string, unknown>,
  ) =>
    recordApiAudit(c, {
      action,
      target: { type: "hook_endpoint", id: endpoint.id, label: endpoint.url },
      metadata: { application_id: endpoint.applicationId, ...metadata },
    });

  router.openapi(createHookEndpointRoute, async (c) => {
    const application = await requireApplication(c.var.auth, c.req.valid("param").application);
    const body = c.req.valid("json");
    const { endpoint, secret } = await createHookEndpoint(
      {
        organizationId: application.organizationId,
        environmentId: application.environmentId,
        applicationId: application.id,
        url: body.url,
        description: body.description,
        filterTypes: body.filter_types,
        secret: body.secret,
        rateLimitPerSecond: body.rate_limit_per_second,
        metadata: body.metadata,
        enabled: body.enabled,
      },
      deps,
    );
    await audit(c, "hook_endpoint.created", endpoint);
    return c.json({ ...toHookEndpointObject(endpoint), secret }, 200);
  });

  router.openapi(listHookEndpointsRoute, async (c) => {
    const application = await requireApplication(c.var.auth, c.req.valid("param").application);
    const rows = await listHookEndpoints({
      organizationId: application.organizationId,
      applicationId: application.id,
    });
    return c.json(
      { object: "list" as const, data: rows.map(toHookEndpointObject), has_more: false },
      200,
    );
  });

  router.openapi(getHookEndpointRoute, async (c) => {
    const { application, endpoint_id } = c.req.valid("param");
    const { endpoint } = await requireEndpoint(c.var.auth, application, endpoint_id);
    return c.json(toHookEndpointObject(endpoint), 200);
  });

  router.openapi(updateHookEndpointRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { application } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    const body = c.req.valid("json");
    const endpoint = await updateHookEndpoint(
      {
        organizationId: application.organizationId,
        environmentId: application.environmentId,
        applicationId: application.id,
        id: endpoint_id,
        url: body.url,
        description: body.description,
        filterTypes: body.filter_types,
        rateLimitPerSecond: body.rate_limit_per_second,
        metadata: body.metadata,
        enabled: body.enabled,
      },
      deps,
    );
    await audit(c, "hook_endpoint.updated", endpoint, { fields: Object.keys(body) });
    return c.json(toHookEndpointObject(endpoint), 200);
  });

  router.openapi(deleteHookEndpointRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { application, endpoint } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    await deleteHookEndpoint({
      organizationId: application.organizationId,
      applicationId: application.id,
      id: endpoint.id,
    });
    await audit(c, "hook_endpoint.deleted", endpoint);
    return c.json(
      { object: "hook_endpoint" as const, id: endpoint.id, deleted: true as const },
      200,
    );
  });

  router.openapi(getHookEndpointSecretRoute, async (c) => {
    const { application, endpoint_id } = c.req.valid("param");
    const { endpoint } = await requireEndpoint(c.var.auth, application, endpoint_id);
    return c.json(
      {
        object: "hook_endpoint_secret" as const,
        secret: revealHookEndpointSecret(endpoint, deps),
      },
      200,
    );
  });

  router.openapi(rollHookEndpointSecretRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { application } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    const body = c.req.valid("json");
    const { endpoint, secret } = await rollHookEndpointSecret(
      {
        organizationId: application.organizationId,
        applicationId: application.id,
        id: endpoint_id,
        previousSecretExpiresIn: body.previous_secret_expires_in,
      },
      deps,
    );
    await audit(c, "hook_endpoint.secret_rolled", endpoint);
    return c.json({ ...toHookEndpointObject(endpoint), secret }, 200);
  });

  router.openapi(recoverHookEndpointRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { endpoint } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    const { since } = c.req.valid("json");
    const recovery = await recoverHookEndpoint({ endpoint, since: new Date(since) });
    await audit(c, "hook_endpoint.recovered", endpoint, { since, recovery_id: recovery.id });
    return c.json(toHookEndpointRecoveryObject(recovery), 200);
  });

  router.openapi(getHookEndpointRecoveryRoute, async (c) => {
    const { application, endpoint_id, recovery_id } = c.req.valid("param");
    const { endpoint } = await requireEndpoint(c.var.auth, application, endpoint_id);
    const recovery = await getHookEndpointRecovery({
      organizationId: endpoint.organizationId,
      endpointId: endpoint.id,
      id: recovery_id,
    });
    if (!recovery) throw new HookError("not_found", "Recovery not found.");
    return c.json(toHookEndpointRecoveryObject(recovery), 200);
  });

  router.openapi(sendHookEndpointTestRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { application, endpoint } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    const body = c.req.valid("json");
    let payload = body.payload;
    if (payload === undefined) {
      const eventType = await getHookEventType({
        organizationId: application.organizationId,
        environmentId: application.environmentId,
        name: body.event_type,
      });
      payload = (eventType?.examples[0] as Record<string, unknown> | undefined) ?? {};
    }
    const quota = await chargeSendQuota(c, 1);
    try {
      const { message } = await sendHookMessage({
        application,
        eventType: body.event_type,
        payload,
        onlyEndpointId: endpoint.id,
      });
      return c.json(toHookMessageObject(message), 202);
    } catch (error) {
      await refundSendQuota(c, quota);
      throw error;
    }
  });

  router.openapi(listHookEndpointDeliveriesRoute, async (c) => {
    const { application: ref, endpoint_id } = c.req.valid("param");
    const { application, endpoint } = await requireEndpoint(c.var.auth, ref, endpoint_id);
    const query = c.req.valid("query");
    const page = await pageHookDeliveries({
      organizationId: application.organizationId,
      applicationId: application.id,
      endpointId: endpoint.id,
      status: query.status,
      limit: query.limit,
      after: query.after,
    });
    return c.json(
      {
        object: "list" as const,
        data: page.deliveries.map(toHookDeliveryObject),
        has_more: page.hasMore,
      },
      200,
    );
  });

  return router;
}
