import type {
  Broadcast,
  Contact,
  CreateBroadcastParams,
  CreateTopicParams,
  SegmentFilter,
  UpdateBroadcastParams,
} from "coss";
import { z } from "zod";
import { failWith, ok, respond, run, truncate, unwrap } from "../result.ts";
import {
  compact,
  cursorSchema,
  DESTRUCTIVE,
  given,
  limitSchema,
  nextCursor,
  READ_ONLY,
  SENDS,
  type ToolContext,
  WRITE,
} from "./shared.ts";

const BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
  "canceled",
  "failed",
] as const;

const page = (limit: number, cursor: string | undefined) => given({ limit, after: cursor });

function contactSummary(contact: Contact): object {
  return compact({
    id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    status: contact.status,
    source: contact.source,
    properties: Object.keys(contact.properties).length > 0 ? contact.properties : undefined,
    created_at: contact.created_at,
  });
}

function broadcastSummary(broadcast: Broadcast): object {
  return compact({
    id: broadcast.id,
    name: broadcast.name,
    status: broadcast.status,
    audience_id: broadcast.audience_id,
    segment_id: broadcast.segment_id,
    topic: broadcast.topic,
    from: broadcast.from,
    subject: broadcast.subject,
    scheduled_at: broadcast.scheduled_at,
    recipients_estimated: broadcast.recipients_estimated,
    pause_reason: broadcast.pause_reason,
    error: broadcast.error,
    stats: broadcast.stats.recipients > 0 ? broadcast.stats : undefined,
    created_at: broadcast.created_at,
  });
}

export function registerMarketingTools(ctx: ToolContext): void {
  const { server, coss } = ctx;
  const broadcastId = z
    .string()
    .describe("The broadcast's id (bcast_…). list_broadcasts finds it.");

  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description:
        "The environment's marketing contacts, newest first. `email` finds one; `status` and " +
        "`audience_id` narrow them.",
      inputSchema: z.object({
        email: z.string().optional(),
        status: z.enum(["subscribed", "unsubscribed", "pending"]).optional(),
        audience_id: z.string().optional(),
        limit: limitSchema(20),
        cursor: cursorSchema,
      }),
      annotations: READ_ONLY,
    },
    ({ email, status, audience_id, limit, cursor }) =>
      respond(
        coss.email.contacts.list({
          ...page(limit, cursor),
          ...given({ email, status, audience_id }),
        }),
        (contacts) => ({
          contacts: contacts.data.map(contactSummary),
          next_cursor: nextCursor(contacts),
        }),
      ),
  );

  server.registerTool(
    "upsert_contact",
    {
      title: "Create or update a contact",
      description:
        "Creates the contact with this address, or updates it. Only add people who agreed to " +
        "hear from this sender. double_opt_in sends them a confirmation email first.",
      inputSchema: z.object({
        email: z.string(),
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        status: z.enum(["subscribed", "unsubscribed"]).optional(),
        properties: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Merged into its properties; define properties in the dashboard first."),
        audience_ids: z.array(z.string()).optional().describe("Audiences to add it to."),
        double_opt_in: z.boolean().optional(),
      }),
      annotations: SENDS,
    },
    ({ properties, ...args }) =>
      respond(
        coss.email.contacts.upsert({
          ...given(args),
          ...(properties ? { properties: properties as never } : {}),
        }),
        contactSummary,
      ),
  );

  server.registerTool(
    "list_audiences",
    {
      title: "List audiences",
      description: "Lists of contacts a broadcast can go to, with how many each holds.",
      inputSchema: z.object({ limit: limitSchema(20), cursor: cursorSchema }),
      annotations: READ_ONLY,
    },
    ({ limit, cursor }) =>
      respond(coss.email.audiences.list(page(limit, cursor)), (audiences) => ({
        audiences: audiences.data,
        next_cursor: nextCursor(audiences),
      })),
  );

  server.registerTool(
    "save_audience",
    {
      title: "Create or rename an audience",
      description: "With an id it renames that audience; without one it creates an audience.",
      inputSchema: z.object({ id: z.string().optional(), name: z.string() }),
      annotations: WRITE,
    },
    ({ id, name }) =>
      respond(
        id ? coss.email.audiences.update(id, { name }) : coss.email.audiences.create({ name }),
      ),
  );

  server.registerTool(
    "list_segments",
    {
      title: "List segments",
      description: "Saved filters over the environment's contacts.",
      inputSchema: z.object({ limit: limitSchema(20), cursor: cursorSchema }),
      annotations: READ_ONLY,
    },
    ({ limit, cursor }) =>
      respond(coss.email.segments.list(page(limit, cursor)), (segments) => ({
        segments: segments.data,
        next_cursor: nextCursor(segments),
      })),
  );

  server.registerTool(
    "save_segment",
    {
      title: "Create or update a segment",
      description:
        "With an id it updates that segment; without one it creates a segment (name and filter " +
        "needed). read_docs on /docs/email/audiences-and-segments has the filter's fields.",
      inputSchema: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        filter: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            '{ "version": 1, "match": "all" | "any", "conditions": [{ "field": "email", "op": "ends_with", "value": "@acme.com" }] }',
          ),
      }),
      annotations: WRITE,
    },
    ({ id, name, filter }) => {
      const typed = filter as unknown as SegmentFilter | undefined;
      if (id) return respond(coss.email.segments.update(id, given({ name, filter: typed })));
      if (!name || !typed) return failWith("A new segment needs a name and a filter.");
      return respond(coss.email.segments.create({ name, filter: typed }));
    },
  );

  server.registerTool(
    "list_topics",
    {
      title: "List topics",
      description: "What contacts can subscribe to on their preference center.",
      inputSchema: z.object({ limit: limitSchema(20), cursor: cursorSchema }),
      annotations: READ_ONLY,
    },
    ({ limit, cursor }) =>
      respond(coss.email.topics.list(page(limit, cursor)), (topics) => ({
        topics: topics.data,
        next_cursor: nextCursor(topics),
      })),
  );

  server.registerTool(
    "save_topic",
    {
      title: "Create or update a topic",
      description:
        "With an id it updates that topic; without one it creates a topic (key, name and " +
        "default_subscription needed).",
      inputSchema: z.object({
        id: z.string().optional(),
        key: z.string().optional().describe("Only when creating; it can't change."),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        default_subscription: z.enum(["opt_in", "opt_out"]).optional(),
        visibility: z.enum(["public", "private"]).optional(),
        position: z.number().int().optional(),
      }),
      annotations: WRITE,
    },
    ({ id, key, ...fields }) => {
      if (id) return respond(coss.email.topics.update(id, given(fields)));
      if (!key || !fields.name || !fields.default_subscription) {
        return failWith("A new topic needs a key, a name and a default_subscription.");
      }
      return respond(coss.email.topics.create(given({ key, ...fields }) as CreateTopicParams));
    },
  );

  server.registerTool(
    "list_broadcasts",
    {
      title: "List broadcasts",
      description: "Marketing sends, newest first, with their status and delivery counts.",
      inputSchema: z.object({
        status: z.enum(BROADCAST_STATUSES).optional(),
        limit: limitSchema(20),
        cursor: cursorSchema,
      }),
      annotations: READ_ONLY,
    },
    ({ status, limit, cursor }) =>
      respond(
        coss.email.broadcasts.list({ ...page(limit, cursor), ...given({ status }) }),
        (list) => ({
          broadcasts: list.data.map(broadcastSummary),
          next_cursor: nextCursor(list),
        }),
      ),
  );

  server.registerTool(
    "get_broadcast",
    {
      title: "Get a broadcast",
      description: "One broadcast with its content (cut to text_limit characters) and counts.",
      inputSchema: z.object({
        id: broadcastId,
        text_limit: z.number().int().min(100).max(100_000).default(4_000),
      }),
      annotations: READ_ONLY,
    },
    ({ id, text_limit }) =>
      run(async () => {
        const broadcast = unwrap(await coss.email.broadcasts.get(id));
        return ok({
          ...broadcastSummary(broadcast),
          preview_text: broadcast.preview_text,
          html: truncate(broadcast.html, text_limit),
          text: truncate(broadcast.text, text_limit),
        });
      }),
  );

  server.registerTool(
    "save_broadcast",
    {
      title: "Create or update a draft broadcast",
      description:
        "With an id it updates that draft; without one it creates a draft (name, from, subject " +
        "and html or text needed). Nothing is sent: use send_test_broadcast, then send_broadcast.",
      inputSchema: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        audience_id: z.string().nullable().optional(),
        segment_id: z.string().nullable().optional(),
        topic: z.string().nullable().optional(),
        from: z.string().optional(),
        reply_to: z.array(z.string()).optional(),
        subject: z.string().optional(),
        preview_text: z.string().nullable().optional(),
        html: z.string().nullable().optional(),
        text: z.string().nullable().optional(),
      }),
      annotations: WRITE,
    },
    ({ id, ...fields }) => {
      if (id) {
        return respond(
          coss.email.broadcasts.update(id, given(fields) as UpdateBroadcastParams),
          broadcastSummary,
        );
      }
      if (!fields.name || !fields.from || !fields.subject) {
        return failWith("A new broadcast needs a name, a from address and a subject.");
      }
      return respond(
        coss.email.broadcasts.create({
          ...(given(fields) as CreateBroadcastParams),
          send: false,
        }),
        broadcastSummary,
      );
    },
  );

  server.registerTool(
    "send_test_broadcast",
    {
      title: "Send a test of a broadcast",
      description: "Sends the draft to the addresses given, rendered for `contact` if named.",
      inputSchema: z.object({
        id: broadcastId,
        to: z.array(z.string()).min(1),
        contact: z.string().optional().describe("A contact's id or address to render it for."),
      }),
      annotations: SENDS,
    },
    ({ id, to, contact }) => respond(coss.email.broadcasts.test(id, given({ to, contact }))),
  );

  server.registerTool(
    "send_broadcast",
    {
      title: "Send a broadcast",
      description:
        "Sends the draft to everyone in its audience or segment, now or at scheduled_at. This " +
        "reaches real people on a live key and can't be recalled once delivered: get the user's " +
        "confirmation of the audience (recipients_estimated) first.",
      inputSchema: z.object({
        id: broadcastId,
        scheduled_at: z.string().optional().describe("An ISO 8601 time to send at."),
      }),
      annotations: SENDS,
    },
    ({ id, scheduled_at }) =>
      respond(coss.email.broadcasts.send(id, given({ scheduled_at })), broadcastSummary),
  );

  server.registerTool(
    "cancel_broadcast",
    {
      title: "Cancel a broadcast",
      description: "Stops a scheduled or sending broadcast. What already went out stays sent.",
      inputSchema: z.object({ id: broadcastId }),
      annotations: DESTRUCTIVE,
    },
    ({ id }) => respond(coss.email.broadcasts.cancel(id), broadcastSummary),
  );

  server.registerTool(
    "get_marketing_settings",
    {
      title: "Get the marketing settings",
      description:
        "The sender's display name and mailing address (required by anti-spam law in every " +
        "broadcast's footer) and the double opt-in defaults.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    () => respond(coss.email.marketingSettings.get()),
  );

  server.registerTool(
    "update_marketing_settings",
    {
      title: "Update the marketing settings",
      description: "Changes the fields given.",
      inputSchema: z.object({
        display_name: z.string().nullable().optional(),
        mailing_address: z.string().nullable().optional(),
        double_opt_in_default: z.boolean().optional(),
        confirmation_from: z.string().nullable().optional(),
        confirmation_subject: z.string().nullable().optional(),
        confirmation_html: z.string().nullable().optional(),
        confirmation_text: z.string().nullable().optional(),
        confirmed_redirect_url: z.string().nullable().optional(),
      }),
      annotations: WRITE,
    },
    (args) => respond(coss.email.marketingSettings.update(given(args))),
  );
}
