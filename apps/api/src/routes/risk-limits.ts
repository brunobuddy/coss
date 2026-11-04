/**
 * Rate limiting as a service: the environment's buckets, and `POST /v1/risk/limits`, which charges
 * one for a key.
 */
import {
  checkRiskLimit,
  createRiskLimitBucket,
  deleteRiskLimitBucket,
  getRiskLimitBucket,
  listRiskLimitBuckets,
  type RiskDeps,
  updateRiskLimitBucket,
} from "@coss/risk";
import {
  CheckRiskLimitRequest,
  CreateRiskLimitBucketRequest,
  DeletedRiskLimitBucket,
  RiskLimit,
  RiskLimitBucket,
  RiskLimitBucketList,
  UpdateRiskLimitBucketRequest,
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
import { idempotencyHeaders, idempotencyHook } from "./idempotency.ts";

const BucketIdParams = z.object({
  id: z
    .string()
    .meta({ description: "The bucket's id.", examples: ["rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

const bucketNotFound = errorDoc(
  "No bucket with this id exists in the API key's environment (`not_found`).",
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

export const checkRiskLimitRoute = createRoute({
  method: "post",
  path: "/risk/limits",
  operationId: "checkRiskLimit",
  tags: ["Risk"],
  summary: "Check a rate limit",
  description:
    "Takes `cost` tokens (default 1) from `key`'s share of one of your buckets and says whether " +
    "to let the request through: a 200 either way, with `allowed`. Denied requests take nothing. " +
    "Each key has its own bucket of `burst` tokens refilling at `limit` per `period_seconds` " +
    "(GCRA, the algorithm coss.com limits its own API with). coss.com keeps only a keyed hash of `key`. " +
    "While coss.com can't count, the bucket's `on_failure` answers and `degraded` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["assess"] }),
    rateLimit("risk.limit"),
    upgradeRequestBody("POST /v1/risk/limits"),
  ] as const,
  request: {
    headers: idempotencyHeaders(
      "Makes retries safe: a repeated allowed check with the same key is answered again " +
        "without taking more tokens, for an hour.",
    ),
    body: { required: true, content: { "application/json": { schema: CheckRiskLimitRequest } } },
  },
  responses: {
    200: json("The answer for this request.", RiskLimit),
    ...jsonBodyErrors,
    400: errorDoc(
      "The body is not valid JSON (`invalid_json`) or the `Idempotency-Key` header is invalid " +
        "(`invalid_idempotency_key`).",
    ),
    ...commonErrors,
    404: errorDoc("No bucket with this name exists in the API key's environment (`not_found`)."),
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
  },
});

export const createRiskLimitBucketRoute = createRoute({
  method: "post",
  path: "/risk/limit_buckets",
  operationId: "createRiskLimitBucket",
  tags: ["Risk"],
  summary: "Create a rate limit bucket",
  description: "At most 100 buckets per environment; names are unique in it.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/risk/limit_buckets"),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateRiskLimitBucketRequest } },
    },
  },
  responses: {
    201: json("The new bucket.", RiskLimitBucket),
    ...jsonBodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation (`validation_error`, see `issues`), the name is taken " +
        "(`limit_bucket_name_taken`) or the environment already has 100 buckets " +
        "(`too_many_limit_buckets`).",
    ),
  },
});

export const listRiskLimitBucketsRoute = createRoute({
  method: "get",
  path: "/risk/limit_buckets",
  operationId: "listRiskLimitBuckets",
  tags: ["Risk"],
  summary: "List rate limit buckets",
  description: "Every bucket of the API key's environment, by name.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")] as const,
  responses: {
    200: json("The buckets.", RiskLimitBucketList),
    ...commonErrors,
  },
});

export const getRiskLimitBucketRoute = createRoute({
  method: "get",
  path: "/risk/limit_buckets/{id}",
  operationId: "getRiskLimitBucket",
  tags: ["Risk"],
  summary: "Retrieve a rate limit bucket",
  description: "One of the rate limit buckets you defined for `POST /v1/risk/limit`.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["read"] }), rateLimit("api.read")] as const,
  request: { params: BucketIdParams },
  responses: {
    200: json("The bucket.", RiskLimitBucket),
    ...commonErrors,
    404: bucketNotFound,
  },
});

export const updateRiskLimitBucketRoute = createRoute({
  method: "patch",
  path: "/risk/limit_buckets/{id}",
  operationId: "updateRiskLimitBucket",
  tags: ["Risk"],
  summary: "Update a rate limit bucket",
  description:
    "Changes the fields given; the next check uses them. Keys keep what they spent, so a smaller " +
    "bucket can deny a key until it refills.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ risk: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/risk/limit_buckets/{id}"),
  ] as const,
  request: {
    params: BucketIdParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateRiskLimitBucketRequest } },
    },
  },
  responses: {
    200: json("The bucket, updated.", RiskLimitBucket),
    ...jsonBodyErrors,
    ...commonErrors,
    404: bucketNotFound,
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
  },
});

export const deleteRiskLimitBucketRoute = createRoute({
  method: "delete",
  path: "/risk/limit_buckets/{id}",
  operationId: "deleteRiskLimitBucket",
  tags: ["Risk"],
  summary: "Delete a rate limit bucket",
  description: "Checks naming it get a 404 from then on; a new bucket with its name starts empty.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ risk: ["update"] }), rateLimit("api.write")] as const,
  request: { params: BucketIdParams },
  responses: {
    200: json("The bucket was deleted.", DeletedRiskLimitBucket),
    ...commonErrors,
    404: bucketNotFound,
  },
});

const BUCKET_NOT_FOUND = "No rate limit bucket with this id exists in this API key's environment.";

export function createRiskLimitRoutes(deps: RiskDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(
    checkRiskLimitRoute,
    async (c) => {
      const params = c.req.valid("json");
      const idempotencyKey = c.req.valid("header")["Idempotency-Key"];
      const { organizationId, environmentId } = c.var.auth;
      return c.json(
        await checkRiskLimit(deps, { organizationId, environmentId }, params, { idempotencyKey }),
        200,
      );
    },
    (result) => {
      idempotencyHook(result);
    },
  );

  router.openapi(createRiskLimitBucketRoute, async (c) => {
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const bucket = await createRiskLimitBucket({ organizationId, environmentId }, params);
    // The key's environment always exists while the key authenticates.
    if (!bucket) throw new Error(`Environment ${environmentId} not found.`);
    await recordApiAudit(c, {
      action: "risk_limit_bucket.created",
      target: { type: "risk_limit_bucket", id: bucket.id, label: bucket.name },
      metadata: { limit: bucket.limit, period_seconds: bucket.period_seconds, burst: bucket.burst },
    });
    return c.json(bucket, 201);
  });

  router.openapi(listRiskLimitBucketsRoute, async (c) => {
    const { organizationId, environmentId } = c.var.auth;
    return c.json(await listRiskLimitBuckets({ organizationId, environmentId }), 200);
  });

  router.openapi(getRiskLimitBucketRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const bucket = await getRiskLimitBucket({ organizationId, environmentId }, id);
    if (!bucket) throw notFound(BUCKET_NOT_FOUND);
    return c.json(bucket, 200);
  });

  router.openapi(updateRiskLimitBucketRoute, async (c) => {
    const { id } = c.req.valid("param");
    const params = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const bucket = await updateRiskLimitBucket({ organizationId, environmentId }, id, params);
    if (!bucket) throw notFound(BUCKET_NOT_FOUND);
    await recordApiAudit(c, {
      action: "risk_limit_bucket.updated",
      target: { type: "risk_limit_bucket", id: bucket.id, label: bucket.name },
      metadata: { fields: Object.keys(params) },
    });
    return c.json(bucket, 200);
  });

  router.openapi(deleteRiskLimitBucketRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const bucket = await deleteRiskLimitBucket({ organizationId, environmentId }, id);
    if (!bucket) throw notFound(BUCKET_NOT_FOUND);
    await recordApiAudit(c, {
      action: "risk_limit_bucket.deleted",
      target: { type: "risk_limit_bucket", id, label: bucket.name },
    });
    return c.json({ object: "risk_limit_bucket" as const, id, deleted: true as const }, 200);
  });

  return router;
}
