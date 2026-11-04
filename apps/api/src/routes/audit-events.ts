import { getOrgAuditEvent, listOrgAuditEvents } from "@coss/logs";
import {
  AuditEvent,
  AuditEventList,
  DEFAULT_AUDIT_LIST_LIMIT,
  ListAuditEventsQuery,
} from "@coss/logs/schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { requirePlanFeature } from "../middleware/plan.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc } from "./docs.ts";

const AuditEventIdParams = z.object({
  id: z.string().meta({
    description: "The audit event's id.",
    examples: ["oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

export const listAuditEventsRoute = createRoute({
  method: "get",
  path: "/audit_events",
  operationId: "listAuditEvents",
  tags: ["Audit log"],
  summary: "List audit events",
  description:
    "The organization's audit log, newest first: changes made by members in the dashboard, by " +
    "API keys (from any environment) and by coss.com support. The audit log is organization-wide, " +
    "so every key of the organization reads the same events. Filter by action (an entry ending " +
    "in `.` matches a whole resource, e.g. `domain.`), actor, target, environment or time. Pass " +
    "the last `id` as `after` to get the next page while `has_more` is true. Reading the audit " +
    "log is not itself logged.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ audit: ["read"] }),
    rateLimit("api.read"),
    requirePlanFeature("auditLog"),
  ],
  request: { query: ListAuditEventsQuery },
  responses: {
    200: jsonDoc("A page of audit events.", AuditEventList),
    ...commonErrors,
    402: billingErrorDoc(
      "The organization's plan doesn't include the audit log (`plan_feature_unavailable`)",
    ),
    422: errorDoc("A query parameter failed validation (`validation_error`)."),
  },
});

export const getAuditEventRoute = createRoute({
  method: "get",
  path: "/audit_events/{id}",
  operationId: "getAuditEvent",
  tags: ["Audit log"],
  summary: "Retrieve an audit event",
  description: "One event of the organization's audit log.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ audit: ["read"] }),
    rateLimit("api.read"),
    requirePlanFeature("auditLog"),
  ],
  request: { params: AuditEventIdParams },
  responses: {
    200: jsonDoc("The audit event.", AuditEvent),
    ...commonErrors,
    402: billingErrorDoc(
      "The organization's plan doesn't include the audit log (`plan_feature_unavailable`)",
    ),
    404: errorDoc("No audit event with this id exists in the organization (`not_found`)."),
  },
});

export function createAuditEventRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();

  router.openapi(listAuditEventsRoute, async (c) => {
    const query = c.req.valid("query");
    const limit = query.limit ?? DEFAULT_AUDIT_LIST_LIMIT;
    const page = await listOrgAuditEvents({
      organizationId: c.var.auth.organizationId,
      before: query.after,
      limit,
      filters: {
        actions: query.action,
        actorTypes: query.actor_type,
        actorId: query.actor_id,
        targetId: query.target_id,
        environmentId: query.environment_id,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
    });
    return c.json(
      { object: "list" as const, data: page.events, has_more: page.nextBefore !== null },
      200,
    );
  });

  router.openapi(getAuditEventRoute, async (c) => {
    const { id } = c.req.valid("param");
    const event = await getOrgAuditEvent(c.var.auth.organizationId, id);
    if (!event) throw notFound("No audit event with this id exists in this organization.");
    return c.json(event, 200);
  });

  return router;
}
