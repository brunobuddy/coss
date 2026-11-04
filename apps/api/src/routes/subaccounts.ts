import {
  createSubaccount,
  deleteSubaccount,
  MAX_SANDBOX_SUBACCOUNTS,
  pageSubaccounts,
  reinstateSubaccount,
  requireSubaccount,
  type SubaccountRow,
  subaccountStats,
  toSubaccountObject,
  updateSubaccount,
} from "@coss/email";
import {
  CreateSubaccountRequest,
  ListSubaccountsQuery,
  MAX_SUBACCOUNT_STATS_DAYS,
  Subaccount,
  SubaccountList,
  SubaccountStats,
  SubaccountStatsQuery,
  UpdateSubaccountRequest,
} from "@coss/email/subaccount-schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc } from "./docs.ts";

const TAG = "Sub-accounts";

const SCOPE_NOTE =
  "Sub-accounts belong to the API key's own environment: a `coss_test_…` key only ever sees " +
  "sandbox ones, a `coss_live_…` key only production ones.";

const SubaccountParams = z.object({
  subaccount: z.string().meta({
    description: "The sub-account's `id` (`sub_…`) or your `uid` for it.",
    examples: ["user_8812"],
  }),
});

const subaccountNotFound = errorDoc(
  "No sub-account with this id or uid exists in the API key's environment (`subaccount_not_found`).",
);

const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const createSubaccountRoute = createRoute({
  method: "post",
  path: "/subaccounts",
  operationId: "createSubaccount",
  tags: [TAG],
  summary: "Create a sub-account",
  description:
    "Creates a sub-account: one of your users, who gets their own domains, suppressions, quotas " +
    "and reputation. Give it a `uid` (e.g. your user's id) to address it by in every path and " +
    `send. ${SCOPE_NOTE}`,
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ subaccount: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/subaccounts"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: CreateSubaccountRequest } } },
  },
  responses: {
    200: jsonDoc("The sub-account.", Subaccount),
    ...bodyErrors,
    ...commonErrors,
    402: billingErrorDoc(
      "Live sub-accounts need a plan with sub-accounts (`plan_feature_unavailable`), up to its limit (`plan_limit_reached`).",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`), the `uid` is invalid (`invalid_uid`) or " +
        "taken (`uid_taken`), the quotas " +
        "don't fit together (`invalid_quotas`), or the sandbox environment has the most sub-accounts " +
        `it can (${MAX_SANDBOX_SUBACCOUNTS}: \`too_many_subaccounts\`).`,
    ),
  },
});

export const listSubaccountsRoute = createRoute({
  method: "get",
  path: "/subaccounts",
  operationId: "listSubaccounts",
  tags: [TAG],
  summary: "List sub-accounts",
  description: `The environment's sub-accounts, newest first. ${SCOPE_NOTE}`,
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ subaccount: ["read"] }), rateLimit("api.read")],
  request: { query: ListSubaccountsQuery },
  responses: {
    200: jsonDoc("A page of sub-accounts.", SubaccountList),
    ...commonErrors,
  },
});

export const getSubaccountRoute = createRoute({
  method: "get",
  path: "/subaccounts/{subaccount}",
  operationId: "getSubaccount",
  tags: [TAG],
  summary: "Retrieve a sub-account",
  description:
    "A sub-account of the API key's environment, by its id or uid, with its quotas and reputation.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ subaccount: ["read"] }), rateLimit("api.read")],
  request: { params: SubaccountParams },
  responses: {
    200: jsonDoc("The sub-account.", Subaccount),
    ...commonErrors,
    404: subaccountNotFound,
  },
});

export const updateSubaccountRoute = createRoute({
  method: "patch",
  path: "/subaccounts/{subaccount}",
  operationId: "updateSubaccount",
  tags: [TAG],
  summary: "Update a sub-account",
  description:
    "Changes the name, uid, metadata, status or quotas. Fields left out keep their value; " +
    '`status: "disabled"` refuses its sends until it is `active` again.',
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ subaccount: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/subaccounts/{subaccount}"),
  ],
  request: {
    params: SubaccountParams,
    body: { required: true, content: { "application/json": { schema: UpdateSubaccountRequest } } },
  },
  responses: {
    200: jsonDoc("The sub-account.", Subaccount),
    ...bodyErrors,
    ...commonErrors,
    404: subaccountNotFound,
    422: errorDoc(
      "The body failed validation (`validation_error`), the uid is invalid (`invalid_uid`) or taken " +
        "(`uid_taken`), the quotas " +
        "don't fit together (`invalid_quotas`), or it is being deleted (`subaccount_deleting`).",
    ),
  },
});

export const deleteSubaccountRoute = createRoute({
  method: "delete",
  path: "/subaccounts/{subaccount}",
  operationId: "deleteSubaccount",
  tags: [TAG],
  summary: "Delete a sub-account",
  description:
    "Starts deleting the sub-account: its sends are refused at once, then its domains are " +
    "released and it is removed with its suppressions (`status` is `deleting` until then). Its " +
    "emails stay, with its id. Repeating the call returns it as it is.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ subaccount: ["delete"] }), rateLimit("api.write")],
  request: { params: SubaccountParams },
  responses: {
    202: jsonDoc("The sub-account, being deleted.", Subaccount),
    ...commonErrors,
    404: subaccountNotFound,
  },
});

export const reinstateSubaccountRoute = createRoute({
  method: "post",
  path: "/subaccounts/{subaccount}/reinstate",
  operationId: "reinstateSubaccount",
  tags: [TAG],
  summary: "Reinstate a sub-account",
  description:
    "Lifts the sub-account's reputation pause (or warning) once you fixed what caused it: its " +
    "rates are measured again from now on. A pause is never lifted on its own. Repeating the call " +
    "returns it as it is. Your organization's own reputation still counts its sending.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ subaccount: ["update"] }), rateLimit("api.write")],
  request: { params: SubaccountParams },
  responses: {
    200: jsonDoc("The sub-account.", Subaccount),
    ...commonErrors,
    404: subaccountNotFound,
  },
});

export const getSubaccountStatsRoute = createRoute({
  method: "get",
  path: "/subaccounts/{subaccount}/stats",
  operationId: "getSubaccountStats",
  tags: [TAG],
  summary: "Retrieve a sub-account's stats",
  description:
    "The sub-account's sending per UTC day: recipients, sent, delivered, bounced, complained, " +
    "failed and suppressed, counted from its emails as they are now (a later bounce moves its " +
    `day's numbers). Emails are kept ${MAX_SUBACCOUNT_STATS_DAYS} days, so earlier days are left out.`,
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ subaccount: ["read"] }), rateLimit("api.read")],
  request: { params: SubaccountParams, query: SubaccountStatsQuery },
  responses: {
    200: jsonDoc("The sub-account's stats.", SubaccountStats),
    ...commonErrors,
    404: subaccountNotFound,
    422: errorDoc(
      "A query parameter failed validation (`validation_error`), or `from` is after `to` (`invalid_range`).",
    ),
  },
});

function label(row: SubaccountRow): string {
  return row.uid ?? row.name;
}

/** The sub-account the path names, in the key's environment (else `subaccount_not_found`). */
function requirePathSubaccount(
  auth: AppEnv["Variables"]["auth"],
  ref: string,
): Promise<SubaccountRow> {
  return requireSubaccount({
    organizationId: auth.organizationId,
    environmentId: auth.environmentId,
    ref,
  });
}

export function createSubaccountRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(createSubaccountRoute, async (c) => {
    const body = c.req.valid("json");
    const { organizationId, environmentId } = c.var.auth;
    const row = await createSubaccount({
      organizationId,
      environmentId,
      name: body.name,
      uid: body.uid,
      metadata: body.metadata,
      quotas: body.quotas,
      plans: c.var.plans ?? undefined,
    });
    await recordApiAudit(c, {
      action: "subaccount.created",
      target: { type: "subaccount", id: row.id, label: label(row) },
    });
    return c.json(toSubaccountObject(row), 200);
  });

  router.openapi(listSubaccountsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const page = await pageSubaccounts({
      organizationId,
      environmentId,
      limit: query.limit,
      after: query.after,
    });
    return c.json(
      {
        object: "list" as const,
        data: page.subaccounts.map(toSubaccountObject),
        has_more: page.hasMore,
      },
      200,
    );
  });

  router.openapi(getSubaccountRoute, async (c) => {
    const row = await requirePathSubaccount(c.var.auth, c.req.valid("param").subaccount);
    return c.json(toSubaccountObject(row), 200);
  });

  router.openapi(reinstateSubaccountRoute, async (c) => {
    const existing = await requirePathSubaccount(c.var.auth, c.req.valid("param").subaccount);
    const { row, changed } = await reinstateSubaccount({
      organizationId: existing.organizationId,
      id: existing.id,
    });
    if (changed) {
      await recordApiAudit(c, {
        action: "subaccount.reinstated",
        target: { type: "subaccount", id: row.id, label: label(row) },
        metadata: { previous_status: existing.reputationStatus },
      });
    }
    return c.json(toSubaccountObject(row), 200);
  });

  router.openapi(getSubaccountStatsRoute, async (c) => {
    const row = await requirePathSubaccount(c.var.auth, c.req.valid("param").subaccount);
    const query = c.req.valid("query");
    return c.json(
      await subaccountStats({
        organizationId: row.organizationId,
        subaccountId: row.id,
        from: query.from,
        to: query.to,
      }),
      200,
    );
  });

  router.openapi(updateSubaccountRoute, async (c) => {
    const existing = await requirePathSubaccount(c.var.auth, c.req.valid("param").subaccount);
    const body = c.req.valid("json");
    const row = await updateSubaccount({
      organizationId: existing.organizationId,
      id: existing.id,
      name: body.name,
      uid: body.uid,
      metadata: body.metadata,
      status: body.status,
      quotas: body.quotas,
    });
    await recordApiAudit(c, {
      action: "subaccount.updated",
      target: { type: "subaccount", id: row.id, label: label(row) },
      metadata: { fields: Object.keys(body) },
    });
    return c.json(toSubaccountObject(row), 200);
  });

  router.openapi(deleteSubaccountRoute, async (c) => {
    const existing = await requirePathSubaccount(c.var.auth, c.req.valid("param").subaccount);
    const row = await deleteSubaccount({
      organizationId: existing.organizationId,
      id: existing.id,
    });
    if (existing.status !== "deleting") {
      await recordApiAudit(c, {
        action: "subaccount.deleted",
        target: { type: "subaccount", id: row.id, label: label(row) },
      });
    }
    return c.json(toSubaccountObject(row), 202);
  });

  return router;
}
