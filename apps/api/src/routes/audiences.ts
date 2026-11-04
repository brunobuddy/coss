import {
  addAudienceContacts,
  createAudience,
  deleteAudience,
  getAudience,
  listAudienceContacts,
  listAudiences,
  removeAudienceContact,
  updateAudience,
} from "@coss/email";
import {
  AddAudienceContactsRequest,
  Audience,
  AudienceContactsAdded,
  AudienceList,
  ContactList,
  CreateAudienceRequest,
  DeletedAudience,
  ListQuery,
  UpdateAudienceRequest,
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

const AudienceParams = z.object({
  id: z.string().meta({
    description: "The audience's id.",
    examples: ["aud_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const MemberParams = AudienceParams.extend({
  contact_id: z.string().meta({
    description: "The contact's id, or its address (URL-encoded).",
    examples: ["contact_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const notFoundDoc = errorDoc(
  "No audience with this id exists in the API key's environment (`not_found`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const listAudiencesRoute = createRoute({
  method: "get",
  path: "/audiences",
  operationId: "listAudiences",
  tags: ["Audiences"],
  summary: "List audiences",
  description: "The static contact lists of the API key's environment, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { query: ListQuery },
  responses: {
    200: jsonDoc("A page of audiences.", AudienceList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const createAudienceRoute = createRoute({
  method: "post",
  path: "/audiences",
  operationId: "createAudience",
  tags: ["Audiences"],
  summary: "Create an audience",
  description:
    "Creates a static contact list in the API key's environment. Names are unique within it (`name_taken`). Add its members with `POST /v1/audiences/{id}/contacts`.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/audiences"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: CreateAudienceRequest } } },
  },
  responses: {
    201: jsonDoc("The new audience.", Audience),
    ...bodyErrors,
    ...commonErrors,
    422: errorDoc("The body failed validation, or the name is taken (`name_taken`)."),
  },
});

export const getAudienceRoute = createRoute({
  method: "get",
  path: "/audiences/{id}",
  operationId: "getAudience",
  tags: ["Audiences"],
  summary: "Retrieve an audience",
  description: "One audience of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: AudienceParams },
  responses: { 200: jsonDoc("The audience.", Audience), ...commonErrors, 404: notFoundDoc },
});

export const updateAudienceRoute = createRoute({
  method: "patch",
  path: "/audiences/{id}",
  operationId: "updateAudience",
  tags: ["Audiences"],
  summary: "Rename an audience",
  description: "Renames an audience. Its members stay.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/audiences/{id}"),
  ],
  request: {
    params: AudienceParams,
    body: { required: true, content: { "application/json": { schema: UpdateAudienceRequest } } },
  },
  responses: {
    200: jsonDoc("The audience.", Audience),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The body failed validation, or the name is taken (`name_taken`)."),
  },
});

export const deleteAudienceRoute = createRoute({
  method: "delete",
  path: "/audiences/{id}",
  operationId: "deleteAudience",
  tags: ["Audiences"],
  summary: "Delete an audience",
  description:
    "Deletes the audience; its contacts stay. Refused while a segment filters on it " +
    "(`audience_in_use`).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["delete"] }), rateLimit("api.write")],
  request: { params: AudienceParams },
  responses: {
    200: jsonDoc("The audience was deleted.", DeletedAudience),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("A segment filters on the audience (`audience_in_use`)."),
  },
});

export const listAudienceContactsRoute = createRoute({
  method: "get",
  path: "/audiences/{id}/contacts",
  operationId: "listAudienceContacts",
  tags: ["Audiences"],
  summary: "List an audience's contacts",
  description: "The audience's members, whatever their status, newest first.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: AudienceParams, query: ListQuery },
  responses: {
    200: jsonDoc("A page of contacts.", ContactList),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const addAudienceContactsRoute = createRoute({
  method: "post",
  path: "/audiences/{id}/contacts",
  operationId: "addAudienceContacts",
  tags: ["Audiences"],
  summary: "Add contacts to an audience",
  description:
    "Adds existing contacts, by id or address. Members already in it are counted in " +
    "`existing`; unknown ones are listed in `missing` (create them first).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/audiences/{id}/contacts"),
  ],
  request: {
    params: AudienceParams,
    body: {
      required: true,
      content: { "application/json": { schema: AddAudienceContactsRequest } },
    },
  },
  responses: {
    200: jsonDoc("What was added.", AudienceContactsAdded),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

export const removeAudienceContactRoute = createRoute({
  method: "delete",
  path: "/audiences/{id}/contacts/{contact_id}",
  operationId: "removeAudienceContact",
  tags: ["Audiences"],
  summary: "Remove a contact from an audience",
  description: "Takes a contact out of the audience. The contact itself stays.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["update"] }), rateLimit("api.write")],
  request: { params: MemberParams },
  responses: {
    200: jsonDoc(
      "The contact left the audience.",
      z.object({
        object: z.literal("audience_contact"),
        audience_id: z.string(),
        contact_id: z.string(),
        deleted: z.literal(true),
      }),
    ),
    ...commonErrors,
    404: errorDoc("The audience doesn't exist, or the contact isn't a member (`not_found`)."),
  },
});

const NOT_FOUND = "No audience with this id exists in this API key's environment.";

export function createAudienceRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const envOf = (c: { var: AppEnv["Variables"] }) => ({
    organizationId: c.var.auth.organizationId,
    environmentId: c.var.auth.environmentId,
  });

  router.openapi(listAudiencesRoute, async (c) =>
    c.json(await listAudiences(envOf(c), c.req.valid("query")), 200),
  );

  router.openapi(createAudienceRoute, async (c) => {
    const audience = await createAudience(envOf(c), c.req.valid("json"));
    await recordApiAudit(c, {
      action: "audience.created",
      target: { type: "audience", id: audience.id, label: audience.name },
    });
    return c.json(audience, 201);
  });

  router.openapi(getAudienceRoute, async (c) => {
    const audience = await getAudience(envOf(c), c.req.valid("param").id);
    if (!audience) throw notFound(NOT_FOUND);
    return c.json(audience, 200);
  });

  router.openapi(updateAudienceRoute, async (c) => {
    const audience = await updateAudience(envOf(c), c.req.valid("param").id, c.req.valid("json"));
    if (!audience) throw notFound(NOT_FOUND);
    await recordApiAudit(c, {
      action: "audience.updated",
      target: { type: "audience", id: audience.id, label: audience.name },
    });
    return c.json(audience, 200);
  });

  router.openapi(deleteAudienceRoute, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deleteAudience(envOf(c), id))) throw notFound(NOT_FOUND);
    await recordApiAudit(c, { action: "audience.deleted", target: { type: "audience", id } });
    return c.json({ object: "audience" as const, id, deleted: true as const }, 200);
  });

  router.openapi(listAudienceContactsRoute, async (c) => {
    const page = await listAudienceContacts(
      envOf(c),
      c.req.valid("param").id,
      c.req.valid("query"),
    );
    if (!page) throw notFound(NOT_FOUND);
    return c.json(page, 200);
  });

  router.openapi(addAudienceContactsRoute, async (c) => {
    const result = await addAudienceContacts(
      envOf(c),
      c.req.valid("param").id,
      c.req.valid("json").contacts,
    );
    if (!result) throw notFound(NOT_FOUND);
    return c.json(result, 200);
  });

  router.openapi(removeAudienceContactRoute, async (c) => {
    const { id, contact_id } = c.req.valid("param");
    if (!(await removeAudienceContact(envOf(c), id, contact_id))) {
      throw notFound("The contact isn't a member of this audience.");
    }
    return c.json(
      {
        object: "audience_contact" as const,
        audience_id: id,
        contact_id,
        deleted: true as const,
      },
      200,
    );
  });

  return router;
}
