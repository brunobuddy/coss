import {
  createRequestFromTemplate,
  createSignBuilderSession,
  deleteSignTemplate,
  getSignTemplate,
  listSignTemplates,
  type SignActor,
  type SignService,
} from "@coss/sign";
import {
  CreateSignBuilderSessionRequest,
  CreateSignRequestFromTemplateRequest,
  CreateSignTemplateRequest,
  DeletedSignTemplate,
  ListSignTemplatesQuery,
  SignBuilderSessionObject,
  SignRequestObject,
  SignTemplateList,
  SignTemplateObject,
  UpdateSignTemplateRequest,
} from "@coss/sign/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { limitBody, SEND_BODY_LIMIT_BYTES } from "../body-limit.ts";
import { ApiError } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";
import { requireSendPermission } from "./sign.ts";

const TAG = "Sign templates";

const TemplateIdParams = z.object({
  id: z.string().meta({
    description: "The template's id.",
    examples: ["stpl_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const notFound = errorDoc(
  "No template with this id exists in the API key's environment (`not_found`).",
);
const unavailable = errorDoc("Sign is temporarily unavailable (`sign_unavailable`).");
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 40 MB (`payload_too_large`)."),
};
const templateErrors = errorDoc(
  "The body failed validation (`validation_error`), a document isn't a PDF coss.com can read " +
    "(`invalid_document`) or isn't in the environment (`not_found`), a field doesn't fit or names " +
    "an unknown role or anchor (`invalid_fields`), or a role is listed twice (`invalid_signers`).",
);

export const createSignTemplateRoute = createRoute({
  method: "post",
  path: "/sign/templates",
  operationId: "createSignTemplate",
  tags: [TAG],
  summary: "Create a template",
  description:
    "Documents with fields for roles (`client`, `company`) instead of named signers, made into " +
    "requests by naming a signer per role. Fields by position or text anchor (resolved now). " +
    "Can start empty and be built in the embedded builder (create a builder session).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["create"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/templates"),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateSignTemplateRequest } },
    },
  },
  responses: {
    201: jsonDoc("The template.", SignTemplateObject),
    ...commonErrors,
    ...bodyErrors,
    422: templateErrors,
    503: unavailable,
  },
});

export const listSignTemplatesRoute = createRoute({
  method: "get",
  path: "/sign/templates",
  operationId: "listSignTemplates",
  tags: [TAG],
  summary: "List templates",
  description: "Newest first. Pass the last `id` as `after` while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { query: ListSignTemplatesQuery },
  responses: {
    200: jsonDoc("A page of templates.", SignTemplateList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`)."),
  },
});

export const getSignTemplateRoute = createRoute({
  method: "get",
  path: "/sign/templates/{id}",
  operationId: "getSignTemplate",
  tags: [TAG],
  summary: "Retrieve a template",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["read"] }), rateLimit("api.read")],
  request: { params: TemplateIdParams },
  responses: { 200: jsonDoc("The template.", SignTemplateObject), ...commonErrors, 404: notFound },
});

export const updateSignTemplateRoute = createRoute({
  method: "patch",
  path: "/sign/templates/{id}",
  operationId: "updateSignTemplate",
  tags: [TAG],
  summary: "Update a template",
  description:
    "Changes the fields given. `documents`, `roles` and `fields` each replace the whole list. " +
    "Requests already made from it don't change.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["update"] }),
    limitBody(SEND_BODY_LIMIT_BYTES),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/sign/templates/{id}"),
  ] as const,
  request: {
    params: TemplateIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateSignTemplateRequest } },
    },
  },
  responses: {
    200: jsonDoc("The template.", SignTemplateObject),
    ...commonErrors,
    ...bodyErrors,
    404: notFound,
    422: templateErrors,
    503: unavailable,
  },
});

export const deleteSignTemplateRoute = createRoute({
  method: "delete",
  path: "/sign/templates/{id}",
  operationId: "deleteSignTemplate",
  tags: [TAG],
  summary: "Delete a template",
  description: "Requests made from it, and its documents, stay.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ sign: ["delete"] }), rateLimit("api.write")],
  request: { params: TemplateIdParams },
  responses: {
    200: jsonDoc("The deleted template.", DeletedSignTemplate),
    ...commonErrors,
    404: notFound,
  },
});

export const createSignRequestFromTemplateRoute = createRoute({
  method: "post",
  path: "/sign/templates/{id}/requests",
  operationId: "createSignRequestFromTemplate",
  tags: [TAG],
  summary: "Create a request from a template",
  description:
    "A signature request with the template's documents and fields: name one signer for each " +
    "role, and give its merge fields' values. Like creating a request, it is sent at once " +
    "unless `send` is `false`, and an `Idempotency-Key` makes retries safe.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/templates/{id}/requests"),
  ] as const,
  request: {
    params: TemplateIdParams,
    headers: idempotencyHeaders(
      "Makes retries safe: a repeated request with the same key and body returns the original " +
        "request (in its current state) instead of creating another, for 24 hours.",
    ),
    body: {
      required: true,
      content: { "application/json": { schema: CreateSignRequestFromTemplateRequest } },
    },
  },
  responses: {
    201: {
      description: "The signature request.",
      headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
      content: { "application/json": { schema: SignRequestObject } },
    },
    ...commonErrors,
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    404: notFound,
    409: errorDoc("Requests with this `Idempotency-Key` are racing (`request_in_progress`)."),
    422: errorDoc(
      "The template isn't ready (`template_incomplete`), a role has no signer or two " +
        "(`invalid_signers`), a merge field doesn't exist (`invalid_fields`), `expires_at` is out " +
        "of range (`invalid_expiry`), or the `Idempotency-Key` was used with a different body " +
        "(`idempotency_key_reused`).",
    ),
    503: unavailable,
  },
});

export const createSignBuilderSessionRoute = createRoute({
  method: "post",
  path: "/sign/templates/{id}/builder_sessions",
  operationId: "createSignBuilderSession",
  tags: [TAG],
  summary: "Create a builder session",
  description:
    "A short-lived link to the embedded builder for this template: upload documents, add roles, " +
    "and drag fields onto pages. Embed it with `mountBuilder` from `coss/sign` (from an origin in " +
    "your Sign settings' `allowed_origins`) for whoever edits the template.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ sign: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/sign/templates/{id}/builder_sessions"),
  ],
  request: {
    params: TemplateIdParams,
    body: {
      required: false,
      content: { "application/json": { schema: CreateSignBuilderSessionRequest } },
    },
  },
  responses: {
    201: jsonDoc("The builder session, with its link.", SignBuilderSessionObject),
    ...commonErrors,
    404: notFound,
    503: unavailable,
  },
});

function apiActor(c: Context<AppEnv>): SignActor {
  return {
    kind: "api_key",
    ipAddress: c.var.clientIp,
    userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
  };
}

export function createSignTemplateRoutes(deps: {
  signService: SignService | null;
  signUrl: string | null;
}): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const unavailableError = () =>
    new ApiError(503, {
      type: "api_error",
      code: "sign_unavailable",
      message: "Sign is temporarily unavailable.",
    });
  const service = (): SignService => {
    if (!deps.signService) throw unavailableError();
    return deps.signService;
  };
  const environment = (c: Context<AppEnv>) => {
    const { organizationId, projectId, environmentId, mode } = c.var.auth;
    return { organizationId, projectId, environmentId, mode };
  };

  router.openapi(createSignTemplateRoute, async (c) => {
    const template = await service().createTemplate({
      environment: environment(c),
      apiKeyId: c.var.auth.apiKeyId,
      params: c.req.valid("json"),
    });
    await recordApiAudit(c, {
      action: "sign_template.created",
      target: { type: "sign_template", id: template.id, label: template.name },
    });
    return c.json(template, 201);
  });

  router.openapi(listSignTemplatesRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    const page = await listSignTemplates({
      organizationId,
      environmentId,
      ...c.req.valid("query"),
    });
    return c.json({ object: "list" as const, data: page.data, has_more: page.hasMore }, 200);
  });

  router.openapi(getSignTemplateRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    const { id } = c.req.valid("param");
    return c.json(await getSignTemplate({ organizationId, environmentId, templateId: id }), 200);
  });

  router.openapi(updateSignTemplateRoute, async (c) => {
    const env = environment(c);
    const { id } = c.req.valid("param");
    const params = c.req.valid("json");
    const template = await service().updateTemplate({
      organizationId: env.organizationId,
      environmentId: env.environmentId,
      templateId: id,
      environment: env,
      apiKeyId: c.var.auth.apiKeyId,
      params,
    });
    await recordApiAudit(c, {
      action: "sign_template.updated",
      target: { type: "sign_template", id, label: template.name },
      metadata: { fields: Object.keys(params) },
    });
    return c.json(template, 200);
  });

  router.openapi(deleteSignTemplateRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    const { id } = c.req.valid("param");
    await deleteSignTemplate({ organizationId, environmentId, templateId: id });
    await recordApiAudit(c, {
      action: "sign_template.deleted",
      target: { type: "sign_template", id },
    });
    return c.json({ object: "sign_template" as const, id, deleted: true as const }, 200);
  });

  router.openapi(
    createSignRequestFromTemplateRoute,
    async (c) => {
      const env = environment(c);
      const { id } = c.req.valid("param");
      await requireSendPermission(c, c.req.valid("json").send);
      const result = await createRequestFromTemplate(service(), {
        organizationId: env.organizationId,
        environmentId: env.environmentId,
        templateId: id,
        environment: env,
        apiKeyId: c.var.auth.apiKeyId,
        actor: apiActor(c),
        params: c.req.valid("json"),
        idempotencyKey: c.req.valid("header")["Idempotency-Key"],
      });
      if (result.replayed) c.header("Idempotent-Replayed", "true");
      return c.json(result.request, 201);
    },
    // A bad Idempotency-Key is a 400, not a 422.
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(createSignBuilderSessionRoute, async (c) => {
    service();
    if (!deps.signUrl) throw unavailableError();
    const { organizationId, environmentId, apiKeyId } = c.var.auth;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json") ?? {};
    const session = await createSignBuilderSession({
      organizationId,
      environmentId,
      templateId: id,
      signUrl: deps.signUrl,
      expiresIn: body.expires_in,
      apiKeyId,
    });
    return c.json(session, 201);
  });

  return router;
}
