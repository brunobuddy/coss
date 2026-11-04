import {
  addSuppression,
  checkSuppression,
  getSuppression,
  importSuppressions,
  listSuppressions,
  removeSuppression,
  requireSubaccount,
  type SuppressionEnvironment,
  suppressionsCsvStream,
} from "@coss/email";
import {
  CheckSuppressionQuery,
  CreateSuppressionRequest,
  DeletedSuppression,
  ExportSuppressionsQuery,
  ImportSuppressionsRequest,
  ListSuppressionsQuery,
  MAX_SUPPRESSION_IMPORT_ENTRIES,
  Suppression,
  SuppressionCheck,
  SuppressionImport,
  SuppressionList,
} from "@coss/email/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, requestIdHeader } from "./docs.ts";

const SuppressionIdParams = z.object({
  id: z.string().meta({
    description: "The suppression's id.",
    examples: ["sup_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const subaccountNotFoundDoc = errorDoc(
  "`subaccount` names no sub-account of the API key's environment (`subaccount_not_found`).",
);

const notFoundDoc = errorDoc(
  "No suppression with this id exists in the API key's environment (`not_found`).",
);

function json<T extends z.ZodType>(description: string, schema: T) {
  return {
    description,
    headers: { "X-Request-Id": requestIdHeader },
    content: { "application/json": { schema } },
  };
}

export const createSuppressionRoute = createRoute({
  method: "post",
  path: "/suppressions",
  operationId: "createSuppression",
  tags: ["Suppressions"],
  summary: "Add an address to the suppression list",
  description:
    "Suppresses an address in the API key's environment: later sends skip it, either for every " +
    'email (`scope: "*"`, the default) or only for emails with the given `category` (e.g. to ' +
    "back an unsubscribe link). Adding an address that is already suppressed with the same " +
    "scope returns the existing entry with status 200.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ suppression: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/suppressions"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateSuppressionRequest } },
    },
  },
  responses: {
    200: json("The address already had an entry with this scope.", Suppression),
    201: json("The new entry.", Suppression),
    400: errorDoc("The body is not valid JSON (`invalid_json`)."),
    ...commonErrors,
    404: subaccountNotFoundDoc,
    413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
    415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
    422: errorDoc("The body failed validation (`validation_error`, see `issues`)."),
  },
});

export const listSuppressionsRoute = createRoute({
  method: "get",
  path: "/suppressions",
  operationId: "listSuppressions",
  tags: ["Suppressions"],
  summary: "List suppressed addresses",
  description:
    "The suppression list of the API key's environment, newest first. Pass the last `id` as " +
    "`after` to get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ suppression: ["read"] }), rateLimit("api.read")],
  request: { query: ListSuppressionsQuery },
  responses: {
    200: json("A page of entries.", SuppressionList),
    ...commonErrors,
    404: subaccountNotFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const checkSuppressionRoute = createRoute({
  method: "get",
  path: "/suppressions/check",
  operationId: "checkSuppression",
  tags: ["Suppressions"],
  summary: "Check whether an address is suppressed",
  description:
    "Whether a send to `address` (with `category`, if given) would skip it, and the entries " +
    "that match: those with scope `*` and, with a `category`, those for that category.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ suppression: ["read"] }), rateLimit("api.read")],
  request: { query: CheckSuppressionQuery },
  responses: {
    200: json("The result.", SuppressionCheck),
    ...commonErrors,
    404: subaccountNotFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const importSuppressionsRoute = createRoute({
  method: "post",
  path: "/suppressions/import",
  operationId: "importSuppressions",
  tags: ["Suppressions"],
  summary: "Import suppressions in bulk",
  description:
    `Adds up to ${MAX_SUPPRESSION_IMPORT_ENTRIES} entries at once, with reason \`import\`. Each ` +
    "entry is validated on its own: invalid ones are skipped and listed in `invalid`, entries " +
    "already on the list are left unchanged and counted in `existing`. Importing again is safe.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ suppression: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/suppressions/import"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ImportSuppressionsRequest } },
    },
  },
  responses: {
    200: json("What the import did.", SuppressionImport),
    400: errorDoc("The body is not valid JSON (`invalid_json`)."),
    ...commonErrors,
    404: subaccountNotFoundDoc,
    413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
    415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
    422: errorDoc(
      "The body is not a list of 1-1000 `{ address, scope? }` objects (`validation_error`).",
    ),
  },
});

export const exportSuppressionsRoute = createRoute({
  method: "get",
  path: "/suppressions/export",
  operationId: "exportSuppressions",
  tags: ["Suppressions"],
  summary: "Export the suppression list as CSV",
  description:
    "The whole suppression list of the API key's environment (optionally filtered), oldest " +
    "first, as CSV with the columns `address,scope,reason,created_at,email_id,id`. The file can " +
    "be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ suppression: ["read"] }), rateLimit("api.read")],
  request: { query: ExportSuppressionsQuery },
  responses: {
    200: {
      description: "The CSV file.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "text/csv": { schema: z.string() } },
    },
    ...commonErrors,
    404: subaccountNotFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const getSuppressionRoute = createRoute({
  method: "get",
  path: "/suppressions/{id}",
  operationId: "getSuppression",
  tags: ["Suppressions"],
  summary: "Retrieve a suppression",
  description: "One entry of the suppression list of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ suppression: ["read"] }), rateLimit("api.read")],
  request: { params: SuppressionIdParams },
  responses: {
    200: json("The entry.", Suppression),
    ...commonErrors,
    404: notFoundDoc,
  },
});

export const deleteSuppressionRoute = createRoute({
  method: "delete",
  path: "/suppressions/{id}",
  operationId: "deleteSuppression",
  tags: ["Suppressions"],
  summary: "Remove a suppression",
  description:
    "Removes the entry, so later sends reach the address again (unless another entry still " +
    "matches). Entries added for bounces and complaints can be removed too.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ suppression: ["delete"] }), rateLimit("api.write")],
  request: { params: SuppressionIdParams },
  responses: {
    200: json("The entry was removed.", DeletedSuppression),
    ...commonErrors,
    404: notFoundDoc,
  },
});

const NOT_FOUND_MESSAGE = "No suppression with this id exists in this API key's environment.";

/** The list a request names: a sub-account's (in the key's environment), else the environment's. */
async function listOf(
  auth: AppEnv["Variables"]["auth"],
  subaccount: string | undefined,
): Promise<SuppressionEnvironment> {
  const { organizationId, environmentId } = auth;
  if (subaccount === undefined) return { organizationId, environmentId };
  const row = await requireSubaccount({
    organizationId,
    environmentId,
    ref: subaccount,
    param: "subaccount",
  });
  return { organizationId, environmentId, subaccountId: row.id };
}

export function createSuppressionRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(createSuppressionRoute, async (c) => {
    const params = c.req.valid("json");
    const { environmentId } = c.var.auth;
    const result = await addSuppression(await listOf(c.var.auth, params.subaccount), params);
    // The key's environment always exists while the key authenticates.
    if (!result) throw new Error(`Environment ${environmentId} not found.`);
    if (!result.created) return c.json(result.suppression, 200);
    await recordApiAudit(c, {
      action: "suppression.created",
      target: { type: "suppression", id: result.suppression.id, label: result.suppression.address },
      metadata: {
        scope: result.suppression.scope,
        ...(result.suppression.subaccount_id && {
          subaccount_id: result.suppression.subaccount_id,
        }),
      },
    });
    return c.json(result.suppression, 201);
  });

  router.openapi(listSuppressionsRoute, async (c) => {
    const query = c.req.valid("query");
    return c.json(await listSuppressions(await listOf(c.var.auth, query.subaccount), query), 200);
  });

  // Registered before `/suppressions/{id}`, which would otherwise match `check`.
  router.openapi(checkSuppressionRoute, async (c) => {
    const query = c.req.valid("query");
    return c.json(await checkSuppression(await listOf(c.var.auth, query.subaccount), query), 200);
  });

  router.openapi(importSuppressionsRoute, async (c) => {
    const { suppressions, subaccount } = c.req.valid("json");
    const { environmentId } = c.var.auth;
    const list = await listOf(c.var.auth, subaccount);
    const result = await importSuppressions(list, suppressions);
    if (!result) throw new Error(`Environment ${environmentId} not found.`);
    await recordApiAudit(c, {
      action: "suppression.imported",
      metadata: {
        created: result.created,
        existing: result.existing,
        invalid: result.invalid.length,
        ...(list.subaccountId && { subaccount_id: list.subaccountId }),
      },
    });
    return c.json(result, 200);
  });

  // Like `check`, registered before `/suppressions/{id}`.
  router.openapi(exportSuppressionsRoute, async (c) => {
    const query = c.req.valid("query");
    const { environmentId } = c.var.auth;
    const list = await listOf(c.var.auth, query.subaccount);
    return c.body(suppressionsCsvStream(list, query), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppressions-${list.subaccountId ?? environmentId}.csv"`,
      "Cache-Control": "no-store",
    });
  });

  router.openapi(getSuppressionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const suppression = await getSuppression({ organizationId, environmentId }, id);
    if (!suppression) throw notFound(NOT_FOUND_MESSAGE);
    return c.json(suppression, 200);
  });

  router.openapi(deleteSuppressionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    if (!(await removeSuppression({ organizationId, environmentId }, id))) {
      throw notFound(NOT_FOUND_MESSAGE);
    }
    await recordApiAudit(c, {
      action: "suppression.deleted",
      target: { type: "suppression", id },
    });
    return c.json({ object: "suppression" as const, id, deleted: true as const }, 200);
  });

  return router;
}
