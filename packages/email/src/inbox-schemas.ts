/**
 * Wire schemas of inboxes (`/v1/inboxes`): an environment's addresses for agents, their threads
 * and messages, sends and replies, and the `inbox.message.received` webhook. Zod only.
 */
import { LATEST_API_VERSION } from "@coss/versioning";
import { z } from "zod";
import { INBOX_EVENT_TYPES } from "./contact-event-types.ts";
import {
  EMAIL_STATUSES,
  ReceivedEmailAttachmentObject,
  SendEmailRequestFields,
} from "./schemas.ts";

export { INBOX_EVENT_TYPES, type InboxEventType } from "./contact-event-types.ts";

export const INBOX_KINDS = ["managed", "domain"] as const;
export const INBOX_MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export const INBOX_MESSAGE_STATUSES = ["received", ...EMAIL_STATUSES] as const;
export const MAX_INBOX_LIST_LIMIT = 100;
export const DEFAULT_INBOX_LIST_LIMIT = 20;
/** Messages a thread is returned with: its latest ones. */
export const MAX_THREAD_MESSAGES = 50;
export const USERNAME_MAX_LENGTH = 64;
export const INBOX_DISPLAY_NAME_MAX_LENGTH = 64;

/**
 * Lower-case letters, digits, `.`, `_` and `-`; starts and ends with a letter or digit, no `..` (an
 * address's local part can't have one). `+` is for subaddresses.
 */
export const INBOX_USERNAME = /^(?!.*\.\.)[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const CLIENT_ID = /^[\x21-\x7e]{1,128}$/;

const INBOX_ID_EXAMPLE = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz";
const THREAD_ID_EXAMPLE = "thread_01k7c8m4r0c2b8w9y3d5f6g7h8";
const INBOUND_MESSAGE_ID_EXAMPLE = "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9";
const OUTBOUND_MESSAGE_ID_EXAMPLE = "imsg_01k7c8m5t2e4d0y1a5f7h8j9k0";
const ADDRESS_EXAMPLE = "support-agent@k3j9x2m7qp4l.inbound.coss.com";

const INBOX_EXAMPLE = {
  object: "inbox",
  id: INBOX_ID_EXAMPLE,
  address: ADDRESS_EXAMPLE,
  username: "support-agent",
  domain: "k3j9x2m7qp4l.inbound.coss.com",
  kind: "managed",
  display_name: "Acme Support",
  client_id: "agent-42",
  can_send: true,
  sandbox: true,
  created_at: "2026-10-10T12:00:00.000Z",
  updated_at: "2026-10-10T12:00:00.000Z",
} as const;

const ATTACHMENT_EXAMPLE = {
  id: "rcvdatt_01k7c8m4r0c2b8w9y3d5f6g7h8",
  filename: "photo.jpg",
  content_type: "image/jpeg",
  content_id: null,
  disposition: "attachment",
  size: 48213,
} as const;

const INBOUND_SUMMARY_EXAMPLE = {
  object: "inbox_message",
  id: INBOUND_MESSAGE_ID_EXAMPLE,
  inbox_id: INBOX_ID_EXAMPLE,
  thread_id: THREAD_ID_EXAMPLE,
  direction: "inbound",
  status: "received",
  from: "Jane Doe <jane@example.com>",
  to: [ADDRESS_EXAMPLE],
  cc: [],
  subject: "My order arrived damaged",
  preview: "Hi, the order arrived damaged. Can you send a new one?",
  attachments: [ATTACHMENT_EXAMPLE],
  spam: false,
  received_email_id: "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz",
  email_id: null,
  created_at: "2026-10-10T12:00:00.000Z",
} as const;

const INBOUND_MESSAGE_EXAMPLE = {
  ...INBOUND_SUMMARY_EXAMPLE,
  reply_to: [],
  message_id: "<CAF3k2m9qp4ld8sv@mail.example.com>",
  in_reply_to: null,
  references: [],
  text: "Hi, the order arrived damaged. Can you send a new one?\n\nJane",
  extracted_text: "Hi, the order arrived damaged. Can you send a new one?\n\nJane",
  html: null,
  truncated: false,
} as const;

const OUTBOUND_MESSAGE_EXAMPLE = {
  object: "inbox_message",
  id: OUTBOUND_MESSAGE_ID_EXAMPLE,
  inbox_id: INBOX_ID_EXAMPLE,
  thread_id: THREAD_ID_EXAMPLE,
  direction: "outbound",
  status: "queued",
  from: `"Acme Support" <${ADDRESS_EXAMPLE}>`,
  to: ["jane@example.com"],
  cc: [],
  subject: "Re: My order arrived damaged",
  preview: "Sorry about that, Jane! A new one is on its way.",
  attachments: [],
  spam: false,
  received_email_id: null,
  email_id: "email_01k7c8m5t2e4d0y1a5f7h8j9k0",
  created_at: "2026-10-10T12:01:00.000Z",
  reply_to: [],
  message_id: null,
  in_reply_to: "<CAF3k2m9qp4ld8sv@mail.example.com>",
  references: ["<CAF3k2m9qp4ld8sv@mail.example.com>"],
  text: "Sorry about that, Jane! A new one is on its way.",
  extracted_text: "Sorry about that, Jane! A new one is on its way.",
  html: null,
  truncated: false,
} as const;

const THREAD_SUMMARY_EXAMPLE = {
  object: "inbox_thread",
  id: THREAD_ID_EXAMPLE,
  inbox_id: INBOX_ID_EXAMPLE,
  subject: "My order arrived damaged",
  participants: ["jane@example.com"],
  message_count: 2,
  preview: "Sorry about that, Jane! A new one is on its way.",
  last_message_at: "2026-10-10T12:01:00.000Z",
  last_inbound_at: "2026-10-10T12:00:00.000Z",
  created_at: "2026-10-10T12:00:00.000Z",
} as const;

// --- Inboxes -------------------------------------------------------------------------------------

export const InboxObject = z
  .object({
    object: z.literal("inbox"),
    id: z.string(),
    address: z.string().meta({ description: "The inbox's email address (`username@domain`)." }),
    username: z.string().meta({ description: "The part of the address before the `@`." }),
    domain: z.string().meta({ description: "The part of the address after the `@`." }),
    kind: z.enum(INBOX_KINDS).meta({
      description:
        "`managed`: at the environment's own domain under coss.com's inbound domain (no DNS " +
        "setup). `domain`: at one of the environment's receiving domains.",
    }),
    display_name: z
      .string()
      .nullable()
      .meta({ description: "The name messages from the inbox are sent with." }),
    client_id: z.string().nullable().meta({
      description:
        "Your own id for the inbox, e.g. your agent's or user's (unique per environment).",
    }),
    can_send: z.boolean().meta({
      description:
        "Whether messages can be sent from the inbox. Inboxes at coss.com's inbound domain only " +
        "receive in live environments: create the inbox at a receiving domain under one of your " +
        "verified domains to send from it.",
    }),
    sandbox: z.boolean().meta({ description: "Whether it belongs to a sandbox environment." }),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "Inbox", examples: [INBOX_EXAMPLE] });

export type InboxObjectOutput = z.output<typeof InboxObject>;

export const InboxList = z
  .object({ object: z.literal("list"), data: z.array(InboxObject), has_more: z.boolean() })
  .meta({
    id: "InboxList",
    examples: [{ object: "list", data: [INBOX_EXAMPLE], has_more: false }],
  });

export type InboxListOutput = z.output<typeof InboxList>;

const Username = z
  .string()
  .max(USERNAME_MAX_LENGTH, `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(
    INBOX_USERNAME,
    "Use lower-case letters, digits, dots, underscores or dashes, starting and ending with a " +
      "letter or digit, without two dots in a row.",
  );

const DisplayName = z
  .string()
  .trim()
  .min(1, "Display names must not be empty.")
  .max(
    INBOX_DISPLAY_NAME_MAX_LENGTH,
    `Display names can be at most ${INBOX_DISPLAY_NAME_MAX_LENGTH} characters.`,
  )
  .refine((value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}"\\]/u.test(value), {
    message: "Display names must not contain quotes, backslashes or control characters.",
  });

export const CreateInboxRequest = z
  .strictObject({
    username: Username.optional().meta({
      description:
        "The part before the @. Omit it for a random one. Mail to `username+anything@domain` " +
        "reaches the inbox too.",
      examples: ["support-agent"],
    }),
    domain: z
      .string()
      .min(1)
      .max(253)
      .optional()
      .meta({
        description:
          "One of the environment's receiving domains (its hostname). Omit it for the " +
          "environment's own domain under coss.com's inbound domain, which needs no DNS setup.",
        examples: ["agents.acme.com"],
      }),
    display_name: DisplayName.optional().meta({
      description: "The name messages from the inbox are sent with.",
      examples: ["Acme Support"],
    }),
    client_id: z
      .string()
      .regex(CLIENT_ID, "Must be 1-128 printable ASCII characters without spaces.")
      .optional()
      .meta({
        description:
          "Your own id for the inbox (unique per environment). Creating an inbox with a " +
          "`client_id` that already has one returns that inbox instead (200), so retries and " +
          '"one inbox per user" need no bookkeeping.',
        examples: ["agent-42"],
      }),
  })
  .meta({
    id: "CreateInboxRequest",
    examples: [{ username: "support-agent", display_name: "Acme Support", client_id: "agent-42" }],
  });

export type CreateInboxRequestInput = z.input<typeof CreateInboxRequest>;
export type CreateInboxRequestOutput = z.output<typeof CreateInboxRequest>;

export const UpdateInboxRequest = z
  .strictObject({
    display_name: z.union([DisplayName, z.null()]).optional().meta({
      description: "The name messages are sent with; `null` sends with the bare address.",
    }),
  })
  .meta({ id: "UpdateInboxRequest", examples: [{ display_name: "Acme Help" }] });

export type UpdateInboxRequestOutput = z.output<typeof UpdateInboxRequest>;

export const DeletedInbox = z
  .object({ object: z.literal("inbox"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedInbox",
    examples: [{ object: "inbox", id: INBOX_ID_EXAMPLE, deleted: true }],
  });

const listQueryShape = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_INBOX_LIST_LIMIT)
    .optional()
    .meta({ description: `1-${MAX_INBOX_LIST_LIMIT}, default ${DEFAULT_INBOX_LIST_LIMIT}.` }),
  after: z
    .string()
    .max(64)
    .optional()
    .meta({ description: "Cursor: the `id` of the last item of the previous page." }),
};

export const ListInboxesQuery = z
  .strictObject(listQueryShape)
  .meta({ description: "Inboxes are returned newest first." });

export type ListInboxesQueryOutput = z.output<typeof ListInboxesQuery>;

// --- Messages ------------------------------------------------------------------------------------

const messageSummaryShape = {
  object: z.literal("inbox_message"),
  id: z.string(),
  inbox_id: z.string(),
  thread_id: z.string(),
  direction: z.enum(INBOX_MESSAGE_DIRECTIONS).meta({
    description: "`inbound`: received by the inbox. `outbound`: sent from it.",
  }),
  status: z.enum(INBOX_MESSAGE_STATUSES).meta({
    description:
      "`received` for inbound messages; an outbound message's email status (`queued`, `sent`, " +
      "`failed`, …): its email has each recipient's delivery.",
  }),
  from: z.string().nullable().meta({ description: "The `From` header." }),
  to: z.array(z.string()).meta({ description: "Addresses in the `To` header." }),
  cc: z.array(z.string()).meta({ description: "Addresses in the `Cc` header." }),
  subject: z.string().nullable().meta({ description: "The subject. `null`: none." }),
  preview: z.string().nullable().meta({
    description: "The start of the message's own text (without the quoted conversation).",
  }),
  attachments: z.array(ReceivedEmailAttachmentObject).meta({
    description: "An inbound message's attachments (download them from the message).",
  }),
  spam: z.boolean().meta({ description: "Whether the receiving server judged it spam." }),
  received_email_id: z
    .string()
    .nullable()
    .meta({ description: "The received email of an inbound message." }),
  email_id: z.string().nullable().meta({
    description: "The email of an outbound message: its delivery events and webhooks name it.",
  }),
  created_at: z.iso.datetime().meta({ description: "When it was received or sent." }),
};

export const InboxMessageSummary = z
  .object(messageSummaryShape)
  .meta({ id: "InboxMessageSummary", examples: [INBOUND_SUMMARY_EXAMPLE] });

export type InboxMessageSummaryOutput = z.output<typeof InboxMessageSummary>;

export const InboxMessageObject = z
  .object({
    ...messageSummaryShape,
    reply_to: z.array(z.string()).meta({ description: "Addresses in the `Reply-To` header." }),
    message_id: z.string().nullable().meta({
      description:
        "An inbound message's `Message-ID` header (outbound ones get theirs at sending).",
    }),
    in_reply_to: z
      .string()
      .nullable()
      .meta({ description: "The message it answers, by `Message-ID`. `null`: none." }),
    references: z
      .array(z.string())
      .meta({ description: "The `Message-ID`s of the conversation so far." }),
    text: z.string().nullable().meta({ description: "The plain text part. `null`: none." }),
    extracted_text: z
      .string()
      .nullable()
      .meta({
        description:
          "The message's own text: `text` without the quoted conversation and signature below it " +
          "(a heuristic; when nothing is left, all of `text`). Made from `html` when there is no " +
          "`text`.",
      }),
    html: z.string().nullable().meta({
      description: "The sender's HTML: sanitize it before showing it to anyone.",
    }),
    truncated: z.boolean().meta({
      description: "Whether `text` or `html` were shortened (2 MB each).",
    }),
  })
  .meta({ id: "InboxMessage", examples: [INBOUND_MESSAGE_EXAMPLE, OUTBOUND_MESSAGE_EXAMPLE] });

export type InboxMessageObjectOutput = z.output<typeof InboxMessageObject>;

export const InboxMessageList = z
  .object({ object: z.literal("list"), data: z.array(InboxMessageSummary), has_more: z.boolean() })
  .meta({
    id: "InboxMessageList",
    examples: [{ object: "list", data: [INBOUND_SUMMARY_EXAMPLE], has_more: false }],
  });

export const ListInboxMessagesQuery = z
  .strictObject({
    ...listQueryShape,
    direction: z.enum(INBOX_MESSAGE_DIRECTIONS).optional().meta({
      description: "Only inbound (received) or outbound (sent) messages.",
    }),
  })
  .meta({ description: "Messages of every thread, newest first." });

export type ListInboxMessagesQueryOutput = z.output<typeof ListInboxMessagesQuery>;

const fields = SendEmailRequestFields.shape;

const sendShape = {
  text: fields.text,
  html: fields.html,
  attachments: fields.attachments,
  tags: fields.tags,
};

export const SendInboxMessageRequest = z
  .strictObject({
    to: fields.to.meta({ description: "Who it goes to." }),
    cc: fields.cc.meta({ description: "Who it's copied to." }),
    bcc: fields.bcc.meta({ description: "Who it's blind copied to." }),
    subject: fields.subject.unwrap().meta({ description: "The new thread's subject." }),
    ...sendShape,
  })
  .meta({
    id: "SendInboxMessageRequest",
    description: "Starts a thread: the message is sent from the inbox's address.",
    examples: [
      {
        to: "jane@example.com",
        subject: "Your order",
        text: "Hi Jane, your order has shipped.",
      },
    ],
  });

export type SendInboxMessageRequestOutput = z.output<typeof SendInboxMessageRequest>;

export const ReplyInboxMessageRequest = z
  .strictObject({
    reply_all: z
      .boolean()
      .optional()
      .meta({
        description:
          "Also reply to everyone else on the message (its `to` and `cc`, but the inbox). Default " +
          "`false`: only the sender (its `Reply-To`, when it has one).",
      }),
    cc: fields.cc.meta({ description: "Who it's copied to." }),
    bcc: fields.bcc.meta({ description: "Who it's blind copied to." }),
    ...sendShape,
  })
  .meta({
    id: "ReplyInboxMessageRequest",
    description:
      "Replies in the message's thread, from the inbox's address, with `Re:` and the headers " +
      "mail clients thread by (`In-Reply-To`, `References`).",
    examples: [{ text: "Sorry about that, Jane! A new one is on its way." }],
  });

export type ReplyInboxMessageRequestOutput = z.output<typeof ReplyInboxMessageRequest>;

// --- Threads -------------------------------------------------------------------------------------

const threadSummaryShape = {
  object: z.literal("inbox_thread"),
  id: z.string(),
  inbox_id: z.string().meta({ description: "The inbox's id." }),
  subject: z.string().nullable().meta({ description: "The first message's subject." }),
  participants: z.array(z.string()).meta({
    description: "Addresses of everyone in the conversation but the inbox (Bcc'd ones never).",
  }),
  message_count: z.number().int().meta({ description: "Messages in the thread." }),
  preview: z.string().nullable().meta({ description: "The start of the latest message." }),
  last_message_at: z.iso
    .datetime()
    .meta({ description: "When its latest message was received or sent." }),
  last_inbound_at: z.iso
    .datetime()
    .nullable()
    .meta({
      description:
        "When its latest inbound message arrived: later than `last_message_at`'s outbound one " +
        "means the conversation awaits a reply.",
    }),
  created_at: z.iso.datetime(),
};

export const InboxThreadSummary = z
  .object(threadSummaryShape)
  .meta({ id: "InboxThreadSummary", examples: [THREAD_SUMMARY_EXAMPLE] });

export type InboxThreadSummaryOutput = z.output<typeof InboxThreadSummary>;

export const InboxThreadObject = z
  .object({
    ...threadSummaryShape,
    messages: z.array(InboxMessageObject).meta({
      description: `The thread's messages, oldest first: its latest ${MAX_THREAD_MESSAGES} (see \`message_count\`; list the inbox's messages for older ones).`,
    }),
  })
  .meta({
    id: "InboxThread",
    examples: [
      { ...THREAD_SUMMARY_EXAMPLE, messages: [INBOUND_MESSAGE_EXAMPLE, OUTBOUND_MESSAGE_EXAMPLE] },
    ],
  });

export type InboxThreadObjectOutput = z.output<typeof InboxThreadObject>;

export const InboxThreadList = z
  .object({ object: z.literal("list"), data: z.array(InboxThreadSummary), has_more: z.boolean() })
  .meta({
    id: "InboxThreadList",
    examples: [{ object: "list", data: [THREAD_SUMMARY_EXAMPLE], has_more: false }],
  });

export const ListInboxThreadsQuery = z
  .strictObject(listQueryShape)
  .meta({ description: "Threads are returned by their latest message, most recent first." });

export type ListInboxThreadsQueryOutput = z.output<typeof ListInboxThreadsQuery>;

export const DeletedInboxThread = z
  .object({ object: z.literal("inbox_thread"), id: z.string(), deleted: z.literal(true) })
  .meta({
    id: "DeletedInboxThread",
    examples: [{ object: "inbox_thread", id: THREAD_ID_EXAMPLE, deleted: true }],
  });

// --- Webhook -------------------------------------------------------------------------------------

/**
 * Body of an `inbox.message.received` webhook request: which inbox, thread and message, from
 * whom and about what, never the content (read the message for it).
 */
export const InboxMessageReceivedWebhookEvent = z
  .object({
    id: z.string().meta({ description: "The event id, and the `webhook-id` header." }),
    object: z.literal("event"),
    type: z.enum(INBOX_EVENT_TYPES),
    api_version: z.string().meta({
      description:
        "The API version (`Coss-Version`) this event is rendered in: the receiving endpoint's `api_version`.",
      examples: [LATEST_API_VERSION],
    }),
    created_at: z.iso.datetime(),
    data: z.object({
      inbox_id: z.string(),
      inbox_address: z.string(),
      thread_id: z.string(),
      message_id: z.string().meta({ description: "The inbox message's id (`imsg_…`)." }),
      received_email_id: z.string(),
      from: z.string().nullable(),
      to: z.array(z.string()),
      subject: z.string().nullable(),
      attachment_count: z.number().int(),
      new_thread: z.boolean().meta({ description: "Whether the message started its thread." }),
      spam: z.boolean(),
      sandbox: z.boolean(),
      received_at: z.iso.datetime(),
    }),
  })
  .meta({
    id: "InboxMessageReceivedWebhookEvent",
    examples: [
      {
        id: "evt_01k7c8m4r0c2b8w9y3d5f6g7j1",
        object: "event",
        type: "inbox.message.received",
        api_version: LATEST_API_VERSION,
        created_at: "2026-10-10T12:00:01.000Z",
        data: {
          inbox_id: INBOX_ID_EXAMPLE,
          inbox_address: ADDRESS_EXAMPLE,
          thread_id: THREAD_ID_EXAMPLE,
          message_id: INBOUND_MESSAGE_ID_EXAMPLE,
          received_email_id: INBOUND_SUMMARY_EXAMPLE.received_email_id,
          from: INBOUND_SUMMARY_EXAMPLE.from,
          to: INBOUND_SUMMARY_EXAMPLE.to,
          subject: INBOUND_SUMMARY_EXAMPLE.subject,
          attachment_count: 1,
          new_thread: true,
          spam: false,
          sandbox: false,
          received_at: INBOUND_SUMMARY_EXAMPLE.created_at,
        },
      },
    ],
  });

export type InboxMessageReceivedWebhookEventOutput = z.output<
  typeof InboxMessageReceivedWebhookEvent
>;
/** What the outbox stores: delivery adds `api_version` when it renders the event for an endpoint. */
export type StoredInboxMessageReceivedWebhookEvent = Omit<
  InboxMessageReceivedWebhookEventOutput,
  "api_version"
>;
