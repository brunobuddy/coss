import {
  authorizeLiveSender,
  type ConfirmationSendOutcome,
  confirmationSender,
  contactsCsvStream,
  createContactProperty,
  deleteContact,
  deleteContactProperty,
  type EmailService,
  getContact,
  getContactProperty,
  getContactRow,
  getContactTopics,
  getMarketingSettingsRow,
  importContacts,
  type LinkKeyRing,
  listContactProperties,
  listContacts,
  preferenceLinks,
  sendConfirmation,
  setContactTopics,
  updateContact,
  updateContactProperty,
  upsertContact,
} from "@coss/email";
import {
  Contact,
  ContactConfirmation,
  ContactImport,
  ContactList,
  ContactPropertyList,
  ContactPropertyObject,
  ContactTopics,
  CreateContactPropertyRequest,
  CreatePreferenceLinksRequest,
  DeletedContact,
  DeletedContactProperty,
  ExportContactsQuery,
  ImportContactsRequest,
  ListContactsQuery,
  MAX_CONTACT_IMPORT_ENTRIES,
  PreferenceLinksObject,
  UpdateContactPropertyRequest,
  UpdateContactRequest,
  UpdateContactTopicsRequest,
  UpsertContactRequest,
} from "@coss/email/contact-schemas";
import { emailSendQuota } from "@coss/ratelimit";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { z } from "zod";
import { recordApiAudit } from "../audit.ts";
import { notFound } from "../errors.ts";
import { requireApiKey } from "../middleware/api-key.ts";
import { upgradeRequestBody } from "../middleware/api-version.ts";
import { rateLimit, rateLimitError } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";
import { billingErrorDoc, commonErrors, errorDoc, jsonDoc, requestIdHeader } from "./docs.ts";

const ContactParams = z.object({
  id: z.string().meta({
    description: "The contact's id, or its address (URL-encoded).",
    examples: ["contact_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const PropertyParams = z.object({
  id: z.string().meta({
    description: "The property's id.",
    examples: ["cprop_01k7c8m4q2f3e9v6t5r1n0p8yz"],
  }),
});

const notFoundDoc = errorDoc(
  "No contact with this id or address exists in the API key's environment (`not_found`).",
);
const propertyNotFoundDoc = errorDoc(
  "No property with this id exists in the API key's environment (`not_found`).",
);
const bodyErrors = {
  400: errorDoc("The body is not valid JSON (`invalid_json`)."),
  413: errorDoc("The request body is larger than 5 MB (`payload_too_large`)."),
  415: errorDoc("The body is not sent as `application/json` (`unsupported_media_type`)."),
};

export const upsertContactRoute = createRoute({
  method: "post",
  path: "/contacts",
  operationId: "upsertContact",
  tags: ["Contacts"],
  summary: "Create or update a contact",
  description:
    "Creates the contact with this address in the API key's environment, or updates the existing " +
    "one: names are replaced when given, `properties` are merged (`null` removes one), " +
    "`audience_ids` are added and `topics` choices recorded. `status` only changes when passed.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create", "update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/contacts"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: UpsertContactRequest } } },
  },
  responses: {
    200: jsonDoc("The existing contact, updated.", Contact),
    201: jsonDoc("The new contact.", Contact),
    ...bodyErrors,
    ...commonErrors,
    402: billingErrorDoc(
      "The environment has as many contacts as the organization's plan allows (`plan_limit_reached`)",
    ),
    422: errorDoc(
      "The body failed validation (`validation_error`), names an unknown property, audience or " +
        "topic (`unknown_property`, `audience_not_found`, `topic_not_found`) or a value of the " +
        'wrong type (`invalid_property`), or sets `status: "subscribed"` while double opt-in ' +
        "applies (`double_opt_in_status`).",
    ),
  },
});

export const listContactsRoute = createRoute({
  method: "get",
  path: "/contacts",
  operationId: "listContacts",
  tags: ["Contacts"],
  summary: "List contacts",
  description:
    "The contacts of the API key's environment, newest first. Pass the last `id` as `after` to " +
    "get the next page while `has_more` is true.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { query: ListContactsQuery },
  responses: {
    200: jsonDoc("A page of contacts.", ContactList),
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const importContactsRoute = createRoute({
  method: "post",
  path: "/contacts/import",
  operationId: "importContacts",
  tags: ["Contacts"],
  summary: "Import contacts in bulk",
  description:
    `Creates or updates up to ${MAX_CONTACT_IMPORT_ENTRIES} contacts at once (source \`import\`). ` +
    "Each entry is validated on its own: invalid ones are skipped and listed in `invalid`. " +
    "Existing contacts get the new names and properties, but an import never re-subscribes an " +
    "unsubscribed contact (`kept_unsubscribed`). Imports send no `contact.*` webhooks. Over the " +
    "plan's contact limit nothing is imported.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create", "update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/contacts/import"),
  ],
  request: {
    body: { required: true, content: { "application/json": { schema: ImportContactsRequest } } },
  },
  responses: {
    200: jsonDoc("What the import did.", ContactImport),
    ...bodyErrors,
    ...commonErrors,
    402: billingErrorDoc(
      "The import would exceed the organization's plan's contact limit (`plan_limit_reached`)",
    ),
    422: errorDoc(
      `The body is not a list of 1-${MAX_CONTACT_IMPORT_ENTRIES} contacts (\`validation_error\`), ` +
        "or `audience_id` is unknown (`audience_not_found`).",
    ),
  },
});

export const exportContactsRoute = createRoute({
  method: "get",
  path: "/contacts/export",
  operationId: "exportContacts",
  tags: ["Contacts"],
  summary: "Export contacts as CSV",
  description:
    "The contacts of the API key's environment (optionally filtered), oldest first, as CSV with " +
    "the columns `email,first_name,last_name,status`, one column per custom property, then " +
    "`created_at,id`. The file can be imported again as is. Values a spreadsheet would run as a " +
    "formula are prefixed with `'`.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { query: ExportContactsQuery },
  responses: {
    200: {
      description: "The CSV file.",
      headers: { "X-Request-Id": requestIdHeader },
      content: { "text/csv": { schema: z.string() } },
    },
    ...commonErrors,
    422: errorDoc("A query parameter failed validation (`validation_error`, see `issues`)."),
  },
});

export const getContactRoute = createRoute({
  method: "get",
  path: "/contacts/{id}",
  operationId: "getContact",
  tags: ["Contacts"],
  summary: "Retrieve a contact",
  description: "One contact of the API key's environment.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: ContactParams },
  responses: { 200: jsonDoc("The contact.", Contact), ...commonErrors, 404: notFoundDoc },
});

export const updateContactRoute = createRoute({
  method: "patch",
  path: "/contacts/{id}",
  operationId: "updateContact",
  tags: ["Contacts"],
  summary: "Update a contact",
  description: "Changes the fields given; `properties` are merged (`null` removes one).",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/contacts/{id}"),
  ],
  request: {
    params: ContactParams,
    body: { required: true, content: { "application/json": { schema: UpdateContactRequest } } },
  },
  responses: {
    200: jsonDoc("The contact.", Contact),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc(
      "The body failed validation (`validation_error`), names an unknown property or topic, or " +
        "a value of the wrong type.",
    ),
  },
});

export const deleteContactRoute = createRoute({
  method: "delete",
  path: "/contacts/{id}",
  operationId: "deleteContact",
  tags: ["Contacts"],
  summary: "Delete a contact",
  description:
    "Deletes the contact with its audience memberships and topic choices. Its suppressions stay: " +
    "they are about the address, not the contact.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["delete"] }), rateLimit("api.write")],
  request: { params: ContactParams },
  responses: {
    200: jsonDoc("The contact was deleted.", DeletedContact),
    ...commonErrors,
    404: notFoundDoc,
  },
});

export const getContactTopicsRoute = createRoute({
  method: "get",
  path: "/contacts/{id}/topics",
  operationId: "getContactTopics",
  tags: ["Contacts"],
  summary: "Retrieve a contact's topics",
  description:
    "Every topic of the environment with the contact's choice and whether its emails reach them.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: ContactParams },
  responses: { 200: jsonDoc("The topics.", ContactTopics), ...commonErrors, 404: notFoundDoc },
});

export const updateContactTopicsRoute = createRoute({
  method: "patch",
  path: "/contacts/{id}/topics",
  operationId: "updateContactTopics",
  tags: ["Contacts"],
  summary: "Update a contact's topics",
  description: "Records the contact's choices for the topics given; the others keep theirs.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/contacts/{id}/topics"),
  ],
  request: {
    params: ContactParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateContactTopicsRequest } },
    },
  },
  responses: {
    200: jsonDoc("The topics.", ContactTopics),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The body failed validation, or names an unknown topic (`topic_not_found`)."),
  },
});

export const listContactPropertiesRoute = createRoute({
  method: "get",
  path: "/contact_properties",
  operationId: "listContactProperties",
  tags: ["Contacts"],
  summary: "List contact properties",
  description: "Every custom contact property of the API key's environment (at most 50), by key.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  responses: { 200: jsonDoc("The properties.", ContactPropertyList), ...commonErrors },
});

export const createContactPropertyRoute = createRoute({
  method: "post",
  path: "/contact_properties",
  operationId: "createContactProperty",
  tags: ["Contacts"],
  summary: "Create a contact property",
  description:
    "Defines a custom property contacts can have. Its key and type can't change; `fallback` is " +
    "what templates use for contacts without a value.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["create"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/contact_properties"),
  ],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateContactPropertyRequest } },
    },
  },
  responses: {
    201: jsonDoc("The new property.", ContactPropertyObject),
    ...bodyErrors,
    ...commonErrors,
    422: errorDoc(
      "The body failed validation, the key exists (`property_exists`), or the environment has " +
        "50 properties (`too_many_properties`).",
    ),
  },
});

export const getContactPropertyRoute = createRoute({
  method: "get",
  path: "/contact_properties/{id}",
  operationId: "getContactProperty",
  tags: ["Contacts"],
  summary: "Retrieve a contact property",
  description: "One contact property of the API key's environment: its key, type and fallback.",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["read"] }), rateLimit("api.read")],
  request: { params: PropertyParams },
  responses: {
    200: jsonDoc("The property.", ContactPropertyObject),
    ...commonErrors,
    404: propertyNotFoundDoc,
  },
});

export const updateContactPropertyRoute = createRoute({
  method: "patch",
  path: "/contact_properties/{id}",
  operationId: "updateContactProperty",
  tags: ["Contacts"],
  summary: "Update a contact property's fallback",
  description:
    "Changes the value used when a contact has none for this property. Its key and type can't change.",
  security: [{ bearerAuth: [] }],
  middleware: [
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("PATCH /v1/contact_properties/{id}"),
  ],
  request: {
    params: PropertyParams,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateContactPropertyRequest } },
    },
  },
  responses: {
    200: jsonDoc("The property.", ContactPropertyObject),
    ...bodyErrors,
    ...commonErrors,
    404: propertyNotFoundDoc,
    422: errorDoc("The fallback doesn't fit the property's type (`invalid_property`)."),
  },
});

export const deleteContactPropertyRoute = createRoute({
  method: "delete",
  path: "/contact_properties/{id}",
  operationId: "deleteContactProperty",
  tags: ["Contacts"],
  summary: "Delete a contact property",
  description:
    "Deletes the property and removes its values from every contact. Refused while a segment " +
    "filters on it (`property_in_use`).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["delete"] }), rateLimit("api.write")],
  request: { params: PropertyParams },
  responses: {
    200: jsonDoc("The property was deleted.", DeletedContactProperty),
    ...commonErrors,
    404: propertyNotFoundDoc,
    422: errorDoc("A segment filters on the property (`property_in_use`)."),
  },
});

export const resendConfirmationRoute = createRoute({
  method: "post",
  path: "/contacts/{id}/confirmation",
  operationId: "resendContactConfirmation",
  tags: ["Contacts"],
  summary: "Resend a contact's confirmation email",
  description:
    "Sends a pending contact (double opt-in) its confirmation email again: at most once a day, " +
    "and three times before it confirms (`status` says what happened).",
  security: [{ bearerAuth: [] }],
  middleware: [requireApiKey({ contact: ["update"] }), rateLimit("api.write")],
  request: { params: ContactParams },
  responses: {
    200: jsonDoc("What happened.", ContactConfirmation),
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc(
      "The marketing settings have no `confirmation_from` (`confirmation_sender_required`), or " +
        "it isn't on a verified domain of the organization (`domain_not_verified`).",
    ),
  },
});

export const createPreferenceLinksRoute = createRoute({
  method: "post",
  path: "/contacts/{id}/preference_links",
  operationId: "createPreferenceLinks",
  tags: ["Contacts"],
  summary: "Create a contact's preference links",
  description:
    "The contact's preference center and unsubscribe links, for emails you build yourself. They " +
    "never expire. Marketing email sent through coss.com gets them (and one-click unsubscribe " +
    "headers) automatically. Needs `contact:update`: whoever has the links can change the " +
    "contact's consent.",
  security: [{ bearerAuth: [] }],
  middleware: [
    // The links change consent, so making them is a write, not a read.
    requireApiKey({ contact: ["update"] }),
    rateLimit("api.write"),
    upgradeRequestBody("POST /v1/contacts/{id}/preference_links"),
  ],
  request: {
    params: ContactParams,
    body: {
      required: false,
      content: { "application/json": { schema: CreatePreferenceLinksRequest } },
    },
  },
  responses: {
    200: jsonDoc("The links.", PreferenceLinksObject),
    ...bodyErrors,
    ...commonErrors,
    404: notFoundDoc,
    422: errorDoc("The body failed validation (`validation_error`)."),
  },
});

const NOT_FOUND = "No contact with this id or address exists in this API key's environment.";

export type ContactRouteDeps = {
  /** Sends double opt-in confirmations (they are the customer's own sends). */
  emailService: Pick<EmailService, "send">;
  links: { keys: LinkKeyRing; baseUrl?: string };
  /** The live provider: live confirmations come from a domain it verified. */
  liveProvider: string;
};
const PROPERTY_NOT_FOUND = "No contact property with this id exists in this API key's environment.";

export function createContactRoutes(deps: ContactRouteDeps): OpenAPIHono<AppEnv> {
  const router = new OpenAPIHono<AppEnv>();
  const envOf = (c: { var: AppEnv["Variables"] }) => ({
    organizationId: c.var.auth.organizationId,
    environmentId: c.var.auth.environmentId,
  });
  const baseUrlOf = (c: Context<AppEnv>) => deps.links.baseUrl ?? new URL(c.req.url).origin;

  /**
   * Charges the confirmation limits (the organization's, and the address's across every
   * organization) and the shared send quota (a confirmation is a send like any other), sends the
   * confirmation, and gives every charge back unless it was sent.
   */
  async function confirm(c: Context<AppEnv>, contactId: string, address: string) {
    const { auth, rateLimiter } = c.var;
    const org = {
      buckets: ["contacts.confirmations.second", "contacts.confirmations.day"] as const,
      subject: auth.organizationId,
      organizationId: auth.organizationId,
    };
    const byAddress = { buckets: ["contacts.confirmation.address"] as const, subject: address };
    const decision = await rateLimiter.consume({ ...org, buckets: [...org.buckets] });
    if (!decision.allowed) {
      throw rateLimitError(decision, {
        code: "confirmation_quota_exceeded",
        message: `Too many confirmation emails (${decision.bucket}). Retry after \`Retry-After\` seconds.`,
      });
    }
    const forAddress = await rateLimiter.consume({ ...byAddress, buckets: [...byAddress.buckets] });
    if (!forAddress.allowed) {
      await rateLimiter.refund({ ...org, buckets: [...org.buckets] });
      return "cooldown" as const;
    }
    const quota = emailSendQuota(auth, 1);
    const sendDecision = await rateLimiter.consume(quota);
    if (!sendDecision.allowed) {
      await Promise.all([
        rateLimiter.refund({ ...org, buckets: [...org.buckets] }),
        rateLimiter.refund({ ...byAddress, buckets: [...byAddress.buckets] }),
      ]);
      throw rateLimitError(sendDecision, {
        code: "quota_exceeded",
        message: `The send quota (${sendDecision.bucket}) is used up. Retry after \`Retry-After\` seconds.`,
      });
    }
    let outcome: ConfirmationSendOutcome;
    try {
      outcome = await sendConfirmation({
        environment: {
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          environmentId: auth.environmentId,
          mode: auth.mode,
        },
        contactId,
        emailService: deps.emailService,
        apiKeyId: auth.apiKeyId,
        apiKeyOwnerId: auth.ownerUserId,
        linkKeys: deps.links.keys,
        baseUrl: baseUrlOf(c),
      });
    } catch (error) {
      outcome = "not_pending";
      await Promise.all([
        rateLimiter.refund({ ...org, buckets: [...org.buckets] }),
        rateLimiter.refund({ ...byAddress, buckets: [...byAddress.buckets] }),
        rateLimiter.refund(quota),
      ]);
      throw error;
    }
    if (outcome !== "sent") {
      await Promise.all([
        rateLimiter.refund({ ...org, buckets: [...org.buckets] }),
        rateLimiter.refund({ ...byAddress, buckets: [...byAddress.buckets] }),
        rateLimiter.refund(quota),
      ]);
    }
    return outcome;
  }

  router.openapi(upsertContactRoute, async (c) => {
    const params = c.req.valid("json");
    const env = envOf(c);
    const doubleOptIn =
      params.double_opt_in ?? (await getMarketingSettingsRow(env))?.doubleOptInDefault ?? false;
    if (doubleOptIn) {
      // Checked before anything is stored: the confirmation must be sendable.
      const from = await confirmationSender(env);
      if (c.var.auth.mode === "live") {
        await authorizeLiveSender({
          organizationId: env.organizationId,
          from,
          provider: deps.liveProvider,
        });
      }
    }
    const result = await upsertContact(env, params, {
      source: "api",
      plans: c.var.plans ?? undefined,
      doubleOptIn,
    });
    if (doubleOptIn && result.pending) {
      await confirm(c, result.contact.id, result.contact.email);
    }
    return c.json(result.contact, result.created ? 201 : 200);
  });

  router.openapi(resendConfirmationRoute, async (c) => {
    const row = await getContactRow(envOf(c), c.req.valid("param").id);
    if (!row) throw notFound(NOT_FOUND);
    const status = row.status === "pending" ? await confirm(c, row.id, row.address) : "not_pending";
    return c.json({ object: "contact_confirmation" as const, contact_id: row.id, status }, 200);
  });

  router.openapi(createPreferenceLinksRoute, async (c) => {
    const row = await getContactRow(envOf(c), c.req.valid("param").id);
    if (!row) throw notFound(NOT_FOUND);
    const body = c.req.valid("json") ?? {};
    const links = preferenceLinks({
      baseUrl: baseUrlOf(c),
      keys: deps.links.keys,
      environmentId: row.environmentId,
      address: row.address,
      topic: body.topic ?? null,
    });
    return c.json(
      {
        object: "preference_links" as const,
        contact_id: row.id,
        preferences_url: links.preferencesUrl,
        unsubscribe_url: links.unsubscribeUrl,
      },
      200,
    );
  });

  router.openapi(listContactsRoute, async (c) => {
    return c.json(await listContacts(envOf(c), c.req.valid("query")), 200);
  });

  // `import` and `export` are registered before `/contacts/{id}`, which would match them.
  router.openapi(importContactsRoute, async (c) => {
    const { contacts, audience_id } = c.req.valid("json");
    const result = await importContacts(envOf(c), contacts, {
      plans: c.var.plans ?? undefined,
      ...(audience_id ? { audienceId: audience_id } : {}),
    });
    await recordApiAudit(c, {
      action: "contact.imported",
      metadata: {
        created: result.created,
        updated: result.updated,
        invalid: result.invalid.length,
      },
    });
    return c.json(result, 200);
  });

  router.openapi(exportContactsRoute, async (c) => {
    const env = envOf(c);
    const keys = (await listContactProperties(env)).map((property) => property.key);
    return c.body(contactsCsvStream(env, c.req.valid("query"), keys), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${env.environmentId}.csv"`,
      "Cache-Control": "no-store",
    });
  });

  router.openapi(getContactRoute, async (c) => {
    const contact = await getContact(envOf(c), c.req.valid("param").id);
    if (!contact) throw notFound(NOT_FOUND);
    return c.json(contact, 200);
  });

  router.openapi(updateContactRoute, async (c) => {
    const contact = await updateContact(envOf(c), c.req.valid("param").id, c.req.valid("json"), {
      source: "api",
    });
    if (!contact) throw notFound(NOT_FOUND);
    return c.json(contact, 200);
  });

  router.openapi(deleteContactRoute, async (c) => {
    const deleted = await deleteContact(envOf(c), c.req.valid("param").id, { source: "api" });
    if (!deleted) throw notFound(NOT_FOUND);
    await recordApiAudit(c, {
      action: "contact.deleted",
      target: { type: "contact", id: deleted.id, label: deleted.email },
    });
    return c.json({ object: "contact" as const, id: deleted.id, deleted: true as const }, 200);
  });

  router.openapi(getContactTopicsRoute, async (c) => {
    const topics = await getContactTopics(envOf(c), c.req.valid("param").id);
    if (!topics) throw notFound(NOT_FOUND);
    return c.json(topics, 200);
  });

  router.openapi(updateContactTopicsRoute, async (c) => {
    const topics = await setContactTopics(
      envOf(c),
      c.req.valid("param").id,
      c.req.valid("json").topics,
      { source: "api" },
    );
    if (!topics) throw notFound(NOT_FOUND);
    return c.json(topics, 200);
  });

  router.openapi(listContactPropertiesRoute, async (c) => {
    const data = await listContactProperties(envOf(c));
    return c.json({ object: "list" as const, data, has_more: false }, 200);
  });

  router.openapi(createContactPropertyRoute, async (c) => {
    const property = await createContactProperty(envOf(c), c.req.valid("json"));
    await recordApiAudit(c, {
      action: "contact_property.created",
      target: { type: "contact_property", id: property.id, label: property.key },
      metadata: { type: property.type },
    });
    return c.json(property, 201);
  });

  router.openapi(getContactPropertyRoute, async (c) => {
    const property = await getContactProperty(envOf(c), c.req.valid("param").id);
    if (!property) throw notFound(PROPERTY_NOT_FOUND);
    return c.json(property, 200);
  });

  router.openapi(updateContactPropertyRoute, async (c) => {
    const property = await updateContactProperty(
      envOf(c),
      c.req.valid("param").id,
      c.req.valid("json"),
    );
    if (!property) throw notFound(PROPERTY_NOT_FOUND);
    await recordApiAudit(c, {
      action: "contact_property.updated",
      target: { type: "contact_property", id: property.id, label: property.key },
    });
    return c.json(property, 200);
  });

  router.openapi(deleteContactPropertyRoute, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await deleteContactProperty(envOf(c), id))) throw notFound(PROPERTY_NOT_FOUND);
    await recordApiAudit(c, {
      action: "contact_property.deleted",
      target: { type: "contact_property", id },
    });
    return c.json({ object: "contact_property" as const, id, deleted: true as const }, 200);
  });

  return router;
}
