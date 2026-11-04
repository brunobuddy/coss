import {
  createSegment,
  deleteSegment,
  getSegment,
  listSegments,
  previewSegmentContacts,
  updateSegment,
} from "@coss/email";
import {
  ContactList,
  CreateSegmentRequest,
  DeletedSegment,
  ListQuery,
  Segment,
  type SegmentFilterOutput,
  SegmentList,
  UpdateSegmentRequest,
} from "@coss/email/contact-schemas";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { commonErrors, errorDoc, jsonDoc } from "./docs.ts";

const SegmentParams = z.object({
  id: z.string().meta({
    description: "The segment's id.",
    examples: ["seg_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const notFoundDoc = errorDoc(
  "No segment with this id exists in the API key's environment (`not_found`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};
const filterErrors = errorDoc(
  "The body failed validation (`validation_error`), the filter names an unknown property, " +
    "audience or topic or uses an operator that doesn't suit the property's type " +
    "(`invalid_filter`, `param` names the condition), or the name is taken (`name_taken`).",
);

export const listSegmentsRoute = createRoute({
  method: "get",
  path: "/segments",
  operationId: "listSegments",
  tags: ["Segments"],
  summary: "List segments",
  description: "The segments (contact filters) of the API key's environment, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { query: ListQuery },
  responses: {
    200: jsonDoc("A page of segments.", SegmentList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const createSegmentRoute = createRoute({
  method: "post",
  path: "/segments",
  operationId: "createSegment",
  tags: ["Segments"],
  summary: "Create a segment",
  description:
    "A segment is a filter over the environment's contacts, evaluated whenever it is used, so " +
    "its contacts are always current.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/segments"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: CreateSegmentRequest } } },
  },
  responses: {
    201: jsonDoc("The new segment.", Segment),
    ...bodyErrors,
    ...commonErrors,
    422: filterErrors,
  },
});

export const getSegmentRoute = createRoute({
  method: "get",
  path: "/segments/{id}",
  operationId: "getSegment",
  tags: ["Segments"],
  summary: "Retrieve a segment",
  description: "One segment of the API key's environment, with its filter.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: SegmentParams },
  responses: { 200: jsonDoc("The segment.", Segment), ...commonErrors, 404: notFoundDoc },
});

export const updateSegmentRoute = createRoute({
  method: "patch",
  path: "/segments/{id}",
  operationId: "updateSegment",
  tags: ["Segments"],
  summary: "Update a segment",
  description: "Changes a segment's name or filter. Only the fields given change.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/segments/{id}"),
  ],
  request: {
    params: SegmentParams,
    body: { required: true, content: { "application/json": { schema: UpdateSegmentRequest } } },
  },
  responses: {
    200: jsonDoc("The segment.", Segment),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: filterErrors,
  },
});

export const deleteSegmentRoute = createRoute({
  method: "delete",
  path: "/segments/{id}",
  operationId: "deleteSegment",
  tags: ["Segments"],
  summary: "Delete a segment",
  description: "Deletes a segment. The contacts it matched stay.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["delete"] }), rateLimit("api.write")],
  request: { params: SegmentParams },
  responses: {
    200: jsonDoc("The segment was deleted.", DeletedSegment),
    ...commonErrors,
    404: notFoundDoc,
  },
});

export const listSegmentContactsRoute = createRoute({
  method: "get",
  path: "/segments/{id}/contacts",
  operationId: "listSegmentContacts",
  tags: ["Segments"],
  summary: "List a segment's contacts",
  description:
    "The contacts the segment's filter matches now, whatever their status, newest first. A " +
    "broadcast to the segment goes only to the subscribed ones its topic reaches.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: SegmentParams, query: ListQuery },
  responses: {
    200: jsonDoc("A page of contacts.", ContactList),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

const NOT_FOUND = "No segment with this id exists in this API key's environment.";

export function createSegmentRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const envOf = (c: { var: AppEnv["Variables"] }) => ({
    organizationId: c.var.auth.organizationId,
    environmentId: c.var.auth.environmentId,
  });

  router.openapi(listSegmentsRoute, async (c) =>
    c.json(await listSegments(envOf(c), c.req.valid("query")), 200),
  );

  router.openapi(createSegmentRoute, async (c) => {
    const segment = await createSegment(envOf(c), c.req.valid("json"));
    await recordApiAudit(c, {
      action: "segment.created",
      target: { type: "segment", id: segment.id, label: segment.name },
    });
    return c.json(segment, 201);
  });

  router.openapi(getSegmentRoute, async (c) => {
    const segment = await getSegment(envOf(c), c.req.valid("param").id);
    if (!segment) throw notFound(NOT_FOUND);
    return c.json(segment, 200);
  });

  router.openapi(updateSegmentRoute, async (c) => {
    const segment = await updateSegment(envOf(c), c.req.valid("param").id, c.req.valid("json"));
    if (!segment) throw notFound(NOT_FOUND);
    await recordApiAudit(c, {
      action: "segment.updated",
      target: { type: "segment", id: segment.id, label: segment.name },
    });
    return c.json(segment, 200);
  });

  router.openapi(deleteSegmentRoute, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deleteSegment(envOf(c), id))) throw notFound(NOT_FOUND);
    await recordApiAudit(c, { action: "segment.deleted", target: { type: "segment", id } });
    return c.json({ object: "segment" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listSegmentContactsRoute, async (c) => {
    const env = envOf(c);
    const segment = await getSegment(env, c.req.valid("param").id);
    if (!segment) throw notFound(NOT_FOUND);
    const { count: _count, ...page } = await previewSegmentContacts(
      env,
      segment.filter as SegmentFilterOutput,
      c.req.valid("query"),
    );
    return c.json(page, 200);
  });

  return router;
}
