import { getLogEntry, queryLogs } from "@coss/logs";
import {
  DEFAULT_LOG_RANGE_MS,
  ListLogsQuery,
  type ListLogsQueryOutput,
  LogEntry,
  LogList,
  MAX_LOG_RANGE_MS,
} from "@coss/logs/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { ApiError, notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc } from "./docs.ts";

const LogIdParams = z.object({
  id: z
    .string()
    .meta({ description: "The log line's id.", examples: ["log_01k7c8m4q2f3e9v6t5r1n0p8yz"] }),
});

export const listLogsRoute = createRoute({
  method: "get",
  path: "/logs",
  operationId: "listLogs",
  tags: ["Logs"],
  summary: "List log lines",
  description:
    "The API key's environment log, newest first: every API request made with one of its keys " +
    "(`source: api`), every email event (`email`) and every webhook delivery attempt " +
    "(`webhook`). Filter by time range (an hour by default, at most 31 days), source, level, " +
    "type, status, method, route, key, request, resource or free text. Pass the last `id` as " +
    "`after` to get the next page while `has_more` is true. Reading logs is not itself logged.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ log: ["read"] }), rateLimit("api.read")],
  request: { query: ListLogsQuery },
  responses: {
    200: jsonDoc("A page of log lines.", LogList),
    ...commonErrors,
    422: errorDoc(
      "A query parameter failed validation (`validation_error`), or the range is empty or " +
        "longer than 31 days (`invalid_range`).",
    ),
  },
});

export const getLogRoute = createRoute({
  method: "get",
  path: "/logs/{id}",
  operationId: "getLog",
  tags: ["Logs"],
  summary: "Retrieve a log line",
  description: "One line of the API key's environment log.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ log: ["read"] }), rateLimit("api.read")],
  request: { params: LogIdParams },
  responses: {
    200: jsonDoc("The log line.", LogEntry),
    ...commonErrors,
    404: errorDoc("No log line with this id exists in the API key's environment (`not_found`)."),
  },
});

function rangeOf(query: ListLogsQueryOutput, now: Date): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_LOG_RANGE_MS);
  const span = to.getTime() - from.getTime();
  if (span <= 0 || span > MAX_LOG_RANGE_MS) {
    throw new ApiError(422, {
      type: "invalid_request_error",
      code: "invalid_range",
      message: "`from` must be before `to`, and the range at most 31 days long.",
      param: query.from ? "from" : "to",
    });
  }
  return { from, to };
}

export function createLogRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(listLogsRoute, async (c) => {
    const query = c.req.valid("query");
    const { organizationId, environmentId } = c.var.auth;
    const range = rangeOf(query, new Date());
    const page = await queryLogs({
      organizationId,
      environmentId,
      ...range,
      limit: query.limit,
      after: query.after,
      filters: {
        sources: query.source,
        levels: query.level,
        types: query.type,
        statuses: query.status,
        methods: query.method,
        routes: query.route,
        apiKeyIds: query.api_key_id,
        requestId: query.request_id,
        resourceId: query.resource_id,
        text: query.q,
      },
    });
    return c.json(page, 200);
  });

  router.openapi(getLogRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { organizationId, environmentId } = c.var.auth;
    const entry = await getLogEntry({ organizationId, environmentId }, id);
    if (!entry) throw notFound("No log line with this id exists in this API key's environment.");
    return c.json(entry, 200);
  });

  return router;
}
