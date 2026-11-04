import {
  addRiskListEntry,
  assessRisk,
  forgetRiskUser,
  getRiskAssessment,
  getRiskListEntry,
  listRiskAssessments,
  listRiskListEntries,
  type RiskDeps,
  recordRiskFeedback,
  removeRiskListEntry,
} from "@coss/risk";
import {
  CreateRiskAssessmentRequest,
  CreateRiskFeedbackRequest,
  CreateRiskListEntryRequest,
  DeletedRiskListEntry,
  ForgottenRiskUser,
  ListRiskAssessmentsQuery,
  ListRiskListEntriesQuery,
  RiskAssessment,
  RiskAssessmentList,
  RiskListEntry,
  RiskListEntryList,
} from "@coss/risk/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, requestIdHeader } from "./docs.ts";
import { idempotencyHeaders, idempotencyHook, idempotentReplayedHeader } from "./idempotency.ts";

const AssessmentIdParams = z.object({
  id: z.string().meta({
    description: "The assessment's id.",
    examples: ["rsk_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const ListEntryIdParams = z.object({
  id: z.string().meta({
    description: "The list entry's id.",
    examples: ["rskle_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const UserIdParams = z.object({
  user_id: z
    .string()
    .min(1)
    .max(256)
    .meta({ description: "Your id for the user.", examples: ["u_42"] }),
});

const AssessHeaders = idempotencyHeaders(
  "Makes retries safe: a repeated request with the same key and body returns the original " +
    "assessment instead of assessing (and counting) the event again, for 24 hours.",
);

const assessmentNotFound = errorDoc(
  "No assessment with this id exists in the API key's environment (`not_found`).",
);
const listEntryNotFound = errorDoc(
  "No list entry with this id exists in the API key's environment (`not_found`).",
);

function json<T extends z.ZodType>(description: string, schema: T) {
  return {
    description,
    headers: { "X-Request-Id": requestIdHeader },
    content: { "application/json": { schema } },
  };
}

const jsonBodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const createRiskAssessmentRoute = createRoute({
  method: "post",
  path: "/risk/assessments",
  operationId: "createRiskAssessment",
  tags: ["Risk"],
  summary: "Assess an event",
  description:
    "Assesses a sign-up, login or other event in the API key's environment and returns a " +
    "decision (`allow`, `review` or `block`) with a score and the reasons behind it. coss.com " +
    "combines email and IP signals with what it has seen in this environment (velocity, " +
    "accounts sharing a mailbox, identifiers you reported) and your allow and block lists. " +
    "Signals that are unavailable at the moment are skipped and listed in `degraded`. " +
    "Call it from your server, never from the browser, and treat errors as `allow` " +
    "(fail open) so an outage never locks your users out. `review` decisions also fire a " +
    "`risk.assessment.review` webhook. Live assessments are billed (`risk.assessments`; plans " +
    "include some every month) unless they end in `block`. Past Free's allowance, on a billing " +
    "hold or over a budget, they are free and made without velocity, memory or content " +
    "(`usage_limit` in `degraded`); they never fail over billing. Sandbox (`coss_test_…`) keys " +
    "accept documented test addresses (`192.0.2.x`, `@disposable.test`, `@undeliverable.test`).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.assess"),
    upgradeRequestBody("POST /v1/risk/assessments"),
  ] as const,
  request: {
    headers: AssessHeaders,
    body: {
      required: true,
      content: { "application/json": { schema: CreateRiskAssessmentRequest } },
    },
  },
  responses: {
    201: {
      description: "The assessment. A replay returns the original assessment.",
      headers: { "X-Request-Id": requestIdHeader, "Idempotent-Replayed": idempotentReplayedHeader },
      content: { "application/json": { schema: RiskAssessment } },
    },
    ...jsonBodyErrors,
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    409: errorDoc(
      "Requests with this `Idempotency-Key` are racing for an expired key " +
        "(`request_in_progress`). Retry after `Retry-After` seconds.",
      { "Retry-After": { description: "Seconds to wait.", schema: { type: "integer" } } },
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), or the `Idempotency-Key` " +
        "was already used with a different body (`idempotency_key_reused`).",
    ),
  },
});

export const listRiskAssessmentsRoute = createRoute({
  method: "get",
  path: "/risk/assessments",
  operationId: "listRiskAssessments",
  tags: ["Risk"],
  summary: "List assessments",
  description:
    "The assessments of the API key's environment, newest first. `review_status=open` is the " +
    "review queue. Pass the last `id` as `after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")],
  request: { query: ListRiskAssessmentsQuery },
  responses: {
    200: json("A page of assessments.", RiskAssessmentList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const getRiskAssessmentRoute = createRoute({
  method: "get",
  path: "/risk/assessments/{id}",
  operationId: "getRiskAssessment",
  tags: ["Risk"],
  summary: "Retrieve an assessment",
  description:
    "The email address and IP address are removed 90 days after the assessment; the decision, " +
    "reasons and signals stay for a year.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")],
  request: { params: AssessmentIdParams },
  responses: {
    200: json("The assessment.", RiskAssessment),
    ...commonErrors,
    404: assessmentNotFound,
  },
});

export const createRiskFeedbackRoute = createRoute({
  method: "post",
  path: "/risk/assessments/{id}/feedback",
  operationId: "createRiskFeedback",
  tags: ["Risk"],
  summary: "Report an assessment's outcome",
  description:
    "Tells coss.com what the assessed user turned out to be. `fraud` and `abuse` make later " +
    "assessments with the same mailbox, user, IP address or subnet flag it " +
    "(`history.fraud_*`); `legitimate` takes back what this assessment reported. Resolves an " +
    "open review. Sending the latest outcome again changes nothing.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["feedback"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/risk/assessments/{id}/feedback"),
  ],
  request: {
    params: AssessmentIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: CreateRiskFeedbackRequest } },
    },
  },
  responses: {
    200: json("The assessment with its new outcome.", RiskAssessment),
    ...jsonBodyErrors,
    ...commonErrors,
    404: assessmentNotFound,
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
  },
});

export const createRiskListEntryRoute = createRoute({
  method: "post",
  path: "/risk/list_entries",
  operationId: "createRiskListEntry",
  tags: ["Risk"],
  summary: "Add an allow or block list entry",
  description:
    "Adds an email address (matched by mailbox), domain (with its subdomains), IP address or " +
    "CIDR range, AS number, country or user id to the environment's allow or block list. An " +
    "allow-list match makes the decision `allow` whatever else fired; a block-list match makes " +
    "it `block`. Adding an entry that already exists returns it with status 200.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ riskList: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/risk/list_entries"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateRiskListEntryRequest } },
    },
  },
  responses: {
    200: json("The entry already existed.", RiskListEntry),
    201: json("The new entry.", RiskListEntry),
    ...jsonBodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`) or `value` is not a valid " +
        "value of its `type` (`invalid_list_value`).",
    ),
  },
});

export const listRiskListEntriesRoute = createRoute({
  method: "get",
  path: "/risk/list_entries",
  operationId: "listRiskListEntries",
  tags: ["Risk"],
  summary: "List allow and block list entries",
  description:
    "The environment's list entries, newest first. Pass the last `id` as `after` to get the " +
    "next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskList: ["read"] }), rateLimit("api.read")],
  request: { query: ListRiskListEntriesQuery },
  responses: {
    200: json("A page of entries.", RiskListEntryList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const getRiskListEntryRoute = createRoute({
  method: "get",
  path: "/risk/list_entries/{id}",
  operationId: "getRiskListEntry",
  tags: ["Risk"],
  summary: "Retrieve a list entry",
  description: "One allow or block list entry of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskList: ["read"] }), rateLimit("api.read")],
  request: { params: ListEntryIdParams },
  responses: {
    200: json("The entry.", RiskListEntry),
    ...commonErrors,
    404: listEntryNotFound,
  },
});

export const deleteRiskListEntryRoute = createRoute({
  method: "delete",
  path: "/risk/list_entries/{id}",
  operationId: "deleteRiskListEntry",
  tags: ["Risk"],
  summary: "Remove a list entry",
  description: "Removes an entry from its list. Later assessments no longer see it.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ riskList: ["delete"] }), rateLimit("api.write")],
  request: { params: ListEntryIdParams },
  responses: {
    200: json("The entry was removed.", DeletedRiskListEntry),
    ...commonErrors,
    404: listEntryNotFound,
  },
});

export const forgetRiskUserRoute = createRoute({
  method: "delete",
  path: "/risk/users/{user_id}",
  operationId: "forgetRiskUser",
  tags: ["Risk"],
  summary: "Forget a user",
  description:
    "Call this when you delete one of your users: coss.com deletes what identifies them in the " +
    "environment (their mailbox, fraud reports, and the user id, email address, IP address and " +
    "user agent on their assessments). Decisions and reasons stay. Forgetting a user coss.com " +
    "doesn't know succeeds too.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["feedback"] }), rateLimit("api.write")],
  request: { params: UserIdParams },
  responses: {
    200: json("The user is forgotten.", ForgottenRiskUser),
    ...commonErrors,
  },
});

const ASSESSMENT_NOT_FOUND = "No assessment with this id exists in this API key's environment.";
const LIST_ENTRY_NOT_FOUND = "No list entry with this id exists in this API key's environment.";

export function createRiskRoutes(deps: RiskDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    createRiskAssessmentRoute,
    async (c) => {
      const params = c.req.valid("json");
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { apiKeyId, ownerUserId, organizationId, projectId, environmentId, mode } = c.var.auth;
      // Tenancy always comes from the authenticated key, never from the request.
      const { assessment, replayed } = await assessRisk(deps, {
        environment: { organizationId, projectId, environmentId, mode },
        params,
        idempotencyKey,
        apiKeyId,
        userId: ownerUserId,
        metered: true,
        requestId: c.var.requestId,
      });
      if (replayed) c.header("Idempotent-Replayed", "true");
      return c.json(assessment, 201);
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(listRiskAssessmentsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await listRiskAssessments({ organizationId, environmentId }, query), 200);
  });

  router.openapi(getRiskAssessmentRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const assessment = await getRiskAssessment({ organizationId, environmentId }, id);
    if (!assessment) throw notFound(ASSESSMENT_NOT_FOUND);
    return c.json(assessment, 200);
  });

  router.openapi(createRiskFeedbackRoute, async (c) => {
    const { id } = c.req.valid("param");
    const params = c.req.valid("json");
    const { apiKeyId, organizationId, environmentId } = c.var.auth;
    const assessment = await recordRiskFeedback(
      deps.hash,
      { organizationId, environmentId },
      id,
      params,
      { source: "api", actorId: apiKeyId },
    );
    if (!assessment) throw notFound(ASSESSMENT_NOT_FOUND);
    return c.json(assessment, 200);
  });

  router.openapi(createRiskListEntryRoute, async (c) => {
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const result = await addRiskListEntry({ organizationId, environmentId }, params);
    // The key's environment always exists while the key authenticates.
    if (!result) throw new Error(`Environment ${environmentId} not found.`);
    if (!result.created) return c.json(result.entry, 200);
    await recordApiAudit(c, {
      action: "risk_list_entry.created",
      target: { type: "risk_list_entry", id: result.entry.id, label: result.entry.value },
      metadata: { list: result.entry.list, type: result.entry.type },
    });
    return c.json(result.entry, 201);
  });

  router.openapi(listRiskListEntriesRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await listRiskListEntries({ organizationId, environmentId }, query), 200);
  });

  router.openapi(getRiskListEntryRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const entry = await getRiskListEntry({ organizationId, environmentId }, id);
    if (!entry) throw notFound(LIST_ENTRY_NOT_FOUND);
    return c.json(entry, 200);
  });

  router.openapi(deleteRiskListEntryRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const entry = await removeRiskListEntry({ organizationId, environmentId }, id);
    if (!entry) throw notFound(LIST_ENTRY_NOT_FOUND);
    await recordApiAudit(c, {
      action: "risk_list_entry.deleted",
      target: { type: "risk_list_entry", id, label: entry.value },
      metadata: { list: entry.list, type: entry.type },
    });
    return c.json({ object: "risk_list_entry" as const, id, deleted: true as const }, 200);
  });

  router.openapi(forgetRiskUserRoute, async (c) => {
    const { user_id: userId } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const changed = await forgetRiskUser(deps.hash, { organizationId, environmentId }, userId);
    // Not the user id itself: the audit log would remember who was forgotten.
    await recordApiAudit(c, { action: "risk_user.forgotten", metadata: { assessments: changed } });
    return c.json({ object: "risk_user" as const, id: userId, deleted: true as const }, 200);
  });

  return router;
}
