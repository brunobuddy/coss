import {
  createTopic,
  deleteTopic,
  getMarketingSettings,
  getTopic,
  listTopics,
  updateMarketingSettings,
  updateTopic,
} from "@coss/email";
import {
  CreateTopicRequest,
  DeletedTopic,
  ListQuery,
  MarketingSettings,
  Topic,
  TopicList,
  UpdateMarketingSettingsRequest,
  UpdateTopicRequest,
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

const TopicParams = z.object({
  id: z.string().meta({
    description: "The topic's id.",
    examples: ["topic_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const notFoundDoc = errorDoc(
  "No topic with this id exists in the API key's environment (`not_found`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const listTopicsRoute = createRoute({
  method: "get",
  path: "/topics",
  operationId: "listTopics",
  tags: ["Topics"],
  summary: "List topics",
  description: "The subscription topics of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { query: ListQuery },
  responses: {
    200: jsonDoc("A page of topics.", TopicList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const createTopicRoute = createRoute({
  method: "post",
  path: "/topics",
  operationId: "createTopic",
  tags: ["Topics"],
  summary: "Create a topic",
  description:
    "A topic is what contacts subscribe to, built on categories: emails sent with `category` " +
    "equal to the topic's `key` are about it, so contacts who opted out (or, for an `opt_out` " +
    "topic, never opted in) are skipped. Public topics show in the preference center.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/topics"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: CreateTopicRequest } } },
  },
  responses: {
    201: jsonDoc("The new topic.", Topic),
    ...bodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation, the key is taken (`topic_exists`), or the environment has the " +
        "most topics it can (`too_many_topics`).",
    ),
  },
});

export const getTopicRoute = createRoute({
  method: "get",
  path: "/topics/{id}",
  operationId: "getTopic",
  tags: ["Topics"],
  summary: "Retrieve a topic",
  description: "One topic of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: TopicParams },
  responses: { 200: jsonDoc("The topic.", Topic), ...commonErrors, 404: notFoundDoc },
});

export const updateTopicRoute = createRoute({
  method: "patch",
  path: "/topics/{id}",
  operationId: "updateTopic",
  tags: ["Topics"],
  summary: "Update a topic",
  description: "Changes the fields given; the key can't change.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/topics/{id}"),
  ],
  request: {
    params: TopicParams,
    body: { required: true, content: { "application/json": { schema: UpdateTopicRequest } } },
  },
  responses: {
    200: jsonDoc("The topic.", Topic),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

export const deleteTopicRoute = createRoute({
  method: "delete",
  path: "/topics/{id}",
  operationId: "deleteTopic",
  tags: ["Topics"],
  summary: "Delete a topic",
  description:
    "Deletes the topic and every contact's choice for it. Refused while a segment filters on it " +
    "(`topic_in_use`).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["delete"] }), rateLimit("api.write")],
  request: { params: TopicParams },
  responses: {
    200: jsonDoc("The topic was deleted.", DeletedTopic),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("A segment filters on the topic (`topic_in_use`)."),
  },
});

export const getMarketingSettingsRoute = createRoute({
  method: "get",
  path: "/marketing_settings",
  operationId: "getMarketingSettings",
  tags: ["Topics"],
  summary: "Retrieve the marketing settings",
  description:
    "The API key's environment's sender name and the postal address its marketing emails carry.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  responses: { 200: jsonDoc("The settings.", MarketingSettings), ...commonErrors },
});

export const updateMarketingSettingsRoute = createRoute({
  method: "patch",
  path: "/marketing_settings",
  operationId: "updateMarketingSettings",
  tags: ["Topics"],
  summary: "Update the marketing settings",
  description: "Changes the fields given (`null` clears one).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/marketing_settings"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateMarketingSettingsRequest } },
    },
  },
  responses: {
    200: jsonDoc("The settings.", MarketingSettings),
    ...bodyErrors,
    ...commonErrors,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

const NOT_FOUND = "No topic with this id exists in this API key's environment.";

export function createTopicRoutes(): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const envOf = (c: { var: AppEnv["Variables"] }) => ({
    organizationId: c.var.auth.organizationId,
    environmentId: c.var.auth.environmentId,
  });

  router.openapi(listTopicsRoute, async (c) =>
    c.json(await listTopics(envOf(c), c.req.valid("query")), 200),
  );

  router.openapi(createTopicRoute, async (c) => {
    const topic = await createTopic(envOf(c), c.req.valid("json"));
    await recordApiAudit(c, {
      action: "topic.created",
      target: { type: "topic", id: topic.id, label: topic.key },
    });
    return c.json(topic, 201);
  });

  router.openapi(getTopicRoute, async (c) => {
    const topic = await getTopic(envOf(c), c.req.valid("param").id);
    if (!topic) throw notFound(NOT_FOUND);
    return c.json(topic, 200);
  });

  router.openapi(updateTopicRoute, async (c) => {
    const topic = await updateTopic(envOf(c), c.req.valid("param").id, c.req.valid("json"));
    if (!topic) throw notFound(NOT_FOUND);
    await recordApiAudit(c, {
      action: "topic.updated",
      target: { type: "topic", id: topic.id, label: topic.key },
    });
    return c.json(topic, 200);
  });

  router.openapi(deleteTopicRoute, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deleteTopic(envOf(c), id))) throw notFound(NOT_FOUND);
    await recordApiAudit(c, { action: "topic.deleted", target: { type: "topic", id } });
    return c.json({ object: "topic" as const, id, deleted: true as const }, 200);
  });

  router.openapi(getMarketingSettingsRoute, async (c) =>
    c.json(await getMarketingSettings(envOf(c)), 200),
  );

  router.openapi(updateMarketingSettingsRoute, async (c) => {
    const params = c.req.valid("json");
    const settings = await updateMarketingSettings(envOf(c), params);
    await recordApiAudit(c, {
      action: "marketing_settings.updated",
      metadata: { fields: Object.keys(params) },
    });
    return c.json(settings, 200);
  });

  return router;
}
