import { describe, expect, test } from "bun:test";
import { BillingError, createPlanGate } from "@coss/billing";
import type { PlanGate } from "@coss/billing/gate";
import { db, schema } from "@coss/db";
import { createTestTenant, type TestTenant } from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import { countRecipients, resolveRecipients } from "../src/audience-resolution.ts";
import {
  addAudienceContacts,
  createAudience,
  deleteAudience,
  listAudienceContacts,
  removeAudienceContact,
} from "../src/audiences.ts";
import {
  BUILT_IN_CSV_HEADERS,
  contactCsvHeader,
  contactCsvRow,
  parseContactCsv,
} from "../src/contact-csv.ts";
import {
  createContactProperty,
  deleteContactProperty,
  listContactProperties,
} from "../src/contact-properties.ts";
import type { SegmentFilterOutput } from "../src/contact-schemas.ts";
import {
  ImportContactsRequest,
  RESERVED_PROPERTY_KEYS,
  UpsertContactRequest,
} from "../src/contact-schemas.ts";
import {
  contactCount,
  deleteContact,
  getContact,
  getContactTopics,
  importContacts,
  listContacts,
  setContactTopics,
  updateContact,
  upsertContact,
} from "../src/contacts.ts";
import { ContactError } from "../src/errors.ts";
import { getMarketingSettings, updateMarketingSettings } from "../src/marketing-settings.ts";
import { createSegment, deleteSegment, previewSegmentContacts } from "../src/segments.ts";
import { createSubaccount } from "../src/subaccounts.ts";
import { addSuppression } from "../src/suppressions.ts";
import { createTopic, deleteTopic } from "../src/topics.ts";

const api = { source: "api" } as const;

function envOf(tenant: TestTenant, mode: "production" | "development" = "production") {
  return { organizationId: tenant.organization.id, environmentId: tenant[mode].id };
}

async function upsert(env: ReturnType<typeof envOf>, input: Record<string, unknown>) {
  return upsertContact(env, UpsertContactRequest.parse(input), api);
}

/** A plan gate with a fixed contact limit, like `createPlanGate` would answer. */
function limitedTo(limit: number): PlanGate {
  return {
    async requireFeature() {},
    async hasFeature() {
      return true;
    },
    async limit() {
      return limit;
    },
    async currentLimit() {
      return limit;
    },
    async requireCapacity(_organizationId, _key, current, count = 1) {
      if (current + count > limit) {
        throw new BillingError("plan_limit_reached", `Your plan includes ${limit} contacts.`);
      }
    },
  };
}

describe("contacts", () => {
  test("upsert creates once per address, then merges names and properties", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createContactProperty(env, { key: "plan", type: "string" });
    await createContactProperty(env, { key: "seats", type: "number" });
    await createContactProperty(env, { key: "renews", type: "date" });

    const first = await upsert(env, {
      email: "Ada <ADA@example.com>",
      first_name: "Ada",
      properties: { plan: "pro", seats: 5, renews: "2027-01-01" },
    });
    expect(first.created).toBe(true);
    expect(first.contact).toMatchObject({
      email: "ada@example.com",
      first_name: "Ada",
      status: "subscribed",
      // Dates are stored canonical.
      properties: { plan: "pro", seats: 5, renews: "2027-01-01T00:00:00.000Z" },
      source: "api",
    });

    const second = await upsert(env, {
      email: "ada@example.com",
      last_name: "Lovelace",
      properties: { seats: null, plan: "scale" },
    });
    expect(second.created).toBe(false);
    expect(second.contact).toMatchObject({
      id: first.contact.id,
      first_name: "Ada",
      last_name: "Lovelace",
      properties: { plan: "scale", renews: "2027-01-01T00:00:00.000Z" },
      status: "subscribed",
    });
    expect(await contactCount(env)).toBe(1);
    expect(await getContact(env, "ADA@example.com")).toMatchObject({ id: first.contact.id });
    expect(await getContact(env, first.contact.id)).toMatchObject({ email: "ada@example.com" });
  });

  test("unknown properties and wrong types are refused, naming the property", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createContactProperty(env, { key: "seats", type: "number" });
    await expect(
      upsert(env, { email: "a@example.com", properties: { plan: "x" } }),
    ).rejects.toMatchObject({
      code: "unknown_property",
      param: "properties.plan",
    });
    await expect(
      upsert(env, { email: "a@example.com", properties: { seats: "5" } }),
    ).rejects.toMatchObject({
      code: "invalid_property",
      param: "properties.seats",
    });
    expect(await contactCount(env)).toBe(0);
  });

  test("status only changes when asked, with the consent timestamps", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const created = await upsert(env, { email: "a@example.com", status: "unsubscribed" });
    expect(created.contact).toMatchObject({ status: "unsubscribed", subscribed_at: null });
    expect(created.contact.unsubscribed_at).not.toBeNull();
    // An upsert without `status` keeps it.
    expect((await upsert(env, { email: "a@example.com" })).contact.status).toBe("unsubscribed");
    const resubscribed = await updateContact(env, "a@example.com", { status: "subscribed" }, api);
    expect(resubscribed).toMatchObject({ status: "subscribed", unsubscribed_at: null });
  });

  test("contacts are per environment", async () => {
    const tenant = await createTestTenant();
    const live = envOf(tenant);
    const sandbox = envOf(tenant, "development");
    const { contact } = await upsert(live, { email: "a@example.com" });
    expect(await getContact(sandbox, contact.id)).toBeNull();
    expect(await getContact(sandbox, "a@example.com")).toBeNull();
    expect(await deleteContact(sandbox, contact.id, api)).toBeNull();
    const other = await createTestTenant();
    expect(await getContact(envOf(other), contact.id)).toBeNull();
  });

  test("the plan's limit holds under parallel creates, and deletes give room back", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const plans = limitedTo(3);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        upsertContact(env, UpsertContactRequest.parse({ email: `c${index}@example.com` }), {
          ...api,
          plans,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const refused = results.find((result) => result.status === "rejected");
    expect(refused && "reason" in refused ? refused.reason : null).toBeInstanceOf(BillingError);
    expect(await contactCount(env)).toBe(3);
    const rows = await db
      .select({ id: schema.contact.id, address: schema.contact.address })
      .from(schema.contact)
      .where(eq(schema.contact.environmentId, env.environmentId));
    expect(rows).toHaveLength(3);

    // Updating an existing contact never counts (any three of the six won the race).
    await upsertContact(env, UpsertContactRequest.parse({ email: rows[0]?.address }), {
      ...api,
      plans,
    });
    const first = rows[0]?.id as string;
    await deleteContact(env, first, api);
    expect(await contactCount(env)).toBe(2);
    await upsertContact(env, UpsertContactRequest.parse({ email: "new@example.com" }), {
      ...api,
      plans,
    });
  });

  test("more concurrent creates than pool connections finish under a plan limit", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    // The real gate reads the plan from the database (the fake one wouldn't need a connection).
    const plans = createPlanGate();
    const creates = Array.from({ length: 15 }, (_, index) =>
      upsertContact(env, UpsertContactRequest.parse({ email: `pool${index}@example.com` }), {
        ...api,
        plans,
      }),
    );
    expect(await Promise.all(creates)).toHaveLength(15);
    expect(await contactCount(env)).toBe(15);
  });

  test("lists newest first with a keyset cursor, filtered by status and audience", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const audience = await createAudience(env, { name: "Beta" });
    for (const index of [0, 1, 2]) {
      await upsertContact(
        env,
        UpsertContactRequest.parse({
          email: `p${index}@example.com`,
          ...(index === 2 ? { audience_ids: [audience.id], status: "unsubscribed" } : {}),
        }),
        api,
      );
    }
    const page = await listContacts(env, { limit: 2 });
    expect(page.data.map((c) => c.email)).toEqual(["p2@example.com", "p1@example.com"]);
    expect(page.has_more).toBe(true);
    const next = await listContacts(env, { limit: 2, after: page.data[1]?.id });
    expect(next.data.map((c) => c.email)).toEqual(["p0@example.com"]);
    expect((await listContacts(env, { status: "unsubscribed" })).data).toHaveLength(1);
    expect((await listContacts(env, { audience_id: audience.id })).data).toHaveLength(1);
    expect((await listContacts(env, { after: "contact_nope" })).data).toEqual([]);
  });

  test("an import never re-subscribes anyone and reports bad rows", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createContactProperty(env, { key: "seats", type: "number" });
    await upsert(env, { email: "gone@example.com", status: "unsubscribed" });
    const audience = await createAudience(env, { name: "Imported" });
    const result = await importContacts(
      env,
      [
        { email: "new@example.com", first_name: "New", properties: { seats: 2 } },
        { email: "gone@example.com", status: "subscribed", first_name: "Gone" },
        { email: "not-an-address" },
        { email: "bad@example.com", properties: { seats: "many" } },
      ],
      { audienceId: audience.id },
    );
    expect(result).toMatchObject({ created: 1, updated: 1, kept_unsubscribed: 1 });
    expect(result.invalid.map((row) => row.index)).toEqual([2, 3]);
    expect(await getContact(env, "gone@example.com")).toMatchObject({
      status: "unsubscribed",
      first_name: "Gone",
    });
    const members = await listAudienceContacts(env, audience.id, {});
    expect(members?.data.map((c) => c.email).sort()).toEqual([
      "gone@example.com",
      "new@example.com",
    ]);
    expect(await contactCount(env)).toBe(2);
  });

  test("import entries can carry topic choices; opt-ins never undo an opt-out", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const all = await createAudience(env, { name: "All" });
    await createTopic(env, { key: "news", name: "News", default_subscription: "opt_in" });
    await createTopic(env, { key: "beta", name: "Beta", default_subscription: "opt_out" });
    await upsert(env, {
      email: "out@example.com",
      topics: [{ topic: "news", status: "opted_out" }],
    });
    await upsert(env, { email: "in@example.com", topics: [{ topic: "beta", status: "opted_in" }] });

    const result = await importContacts(
      env,
      [
        { email: "new@example.com", topics: [{ topic: "beta", status: "opted_in" }] },
        { email: "out@example.com", topics: [{ topic: "news", status: "opted_in" }] },
        { email: "in@example.com", topics: [{ topic: "beta", status: "opted_out" }] },
      ],
      { audienceId: all.id },
    );
    expect(result).toMatchObject({ created: 1, updated: 2, invalid: [] });
    const statusOf = async (email: string, topic: string) =>
      (await getContactTopics(env, email))?.topics.find((t) => t.topic === topic)?.choice;
    expect(await statusOf("new@example.com", "beta")).toBe("opted_in");
    expect(await statusOf("out@example.com", "news")).toBe("opted_out");
    expect(await statusOf("in@example.com", "beta")).toBe("opted_out");
    expect((await listAudienceContacts(env, all.id, {}))?.data).toHaveLength(3);

    await expect(
      importContacts(
        env,
        [{ email: "x@example.com", topics: [{ topic: "nope", status: "opted_in" }] }],
        {},
      ),
    ).rejects.toMatchObject({ code: "topic_not_found" });
    expect(await getContact(env, "x@example.com")).toBeNull();
  });

  test("each import entry is validated on its own, merged properties included", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const keys = Array.from({ length: 9 }, (_, index) => `p${index}`);
    for (const key of keys) await createContactProperty(env, { key, type: "string" });
    const long = "x".repeat(2000);
    // 14 KB stored: two more long values push the merged properties past 16 KB.
    await upsert(env, {
      email: "full@example.com",
      properties: Object.fromEntries(keys.slice(0, 7).map((key) => [key, long])),
    });
    const entries = [
      { email: "fine@example.com", first_name: "Fine" },
      { email: "named@example.com", first_name: "" },
      { email: "full@example.com", properties: { p7: long, p8: long } },
      { email: "later@example.com" },
    ];
    // The request accepts entries a single upsert would refuse; the import reports them.
    expect(ImportContactsRequest.safeParse({ contacts: entries }).success).toBe(true);
    expect(
      ImportContactsRequest.safeParse({ contacts: [{ email: "a@example.com", status: "cleaned" }] })
        .success,
    ).toBe(true);
    const result = await importContacts(env, entries, {});
    expect(result).toMatchObject({ created: 2, updated: 0 });
    expect(result.invalid.map((row) => row.index)).toEqual([1, 2]);
    expect(await getContact(env, "later@example.com")).not.toBeNull();
    expect(Object.keys((await getContact(env, "full@example.com"))?.properties ?? {})).toHaveLength(
      7,
    );
  });

  test("an import and upserts of its later addresses don't deadlock", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const entries = Array.from({ length: 1200 }, (_, index) => ({
      email: `bulk${index}@example.com`,
    }));
    const results = await Promise.allSettled([
      importContacts(env, entries, {}),
      ...Array.from({ length: 20 }, (_, index) =>
        upsert(env, { email: `bulk${1100 + index}@example.com` }),
      ),
    ]);
    expect(results.filter((result) => result.status === "rejected")).toEqual([]);
    expect(await contactCount(env)).toBe(1200);
  });

  test("an import over the plan's limit imports nothing", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await expect(
      importContacts(
        env,
        [{ email: "a@example.com" }, { email: "b@example.com" }, { email: "c@example.com" }],
        { plans: limitedTo(2) },
      ),
    ).rejects.toBeInstanceOf(BillingError);
    expect(await contactCount(env)).toBe(0);
  });

  test("no custom property can take a column name the CSV reads as a built-in field", () => {
    for (const header of BUILT_IN_CSV_HEADERS) {
      expect(RESERVED_PROPERTY_KEYS.has(header)).toBe(true);
    }
    // Nor a name every object inherits.
    expect(RESERVED_PROPERTY_KEYS.has("constructor")).toBe(true);
  });

  test("CSV exports import again unchanged, and other tools' headers are understood", async () => {
    const keys = ["plan", "seats"];
    const csv =
      contactCsvHeader(keys) +
      contactCsvRow(
        {
          object: "contact",
          id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
          email: "ada@example.com",
          first_name: "=cmd",
          last_name: "Lovelace, Countess",
          status: "subscribed",
          properties: { plan: "pro", seats: 5 },
          source: "api",
          subscribed_at: null,
          unsubscribed_at: null,
          confirmed_at: null,
          created_at: "2026-10-10T12:00:00.000Z",
          updated_at: "2026-10-10T12:00:00.000Z",
        },
        keys,
      );
    // Formula-like cells are guarded on export.
    expect(csv).toContain("'=cmd");
    const types = new Map([
      ["plan", "string" as const],
      ["seats", "number" as const],
    ]);
    expect(parseContactCsv(csv, types).entries).toEqual([
      {
        line: 2,
        entry: {
          email: "ada@example.com",
          first_name: "=cmd",
          last_name: "Lovelace, Countess",
          status: "subscribed",
          properties: { plan: "pro", seats: 5 },
        },
      },
    ]);
    const foreign = parseContactCsv(
      "Email Address,First Name,Company\r\ngrace@example.com,Grace,Navy\r\n",
      types,
    );
    expect(foreign.entries[0]?.entry).toEqual({ email: "grace@example.com", first_name: "Grace" });
    expect(foreign.ignoredColumns).toEqual(["Company"]);
    expect(parseContactCsv("a@example.com\nb@example.com\n", types).entries).toHaveLength(2);
    expect(() => parseContactCsv("name,company\nx,y\n", types)).toThrow("email");
  });

  test("string properties keep their spaces through a CSV export and import", () => {
    const types = new Map([["note", "string" as const]]);
    const csv =
      contactCsvHeader(["note"]) +
      contactCsvRow(
        {
          object: "contact",
          id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
          email: "ada@example.com",
          first_name: null,
          last_name: null,
          status: "subscribed",
          properties: { note: "  hello " },
          created_at: "2026-10-16T00:00:00.000Z",
          updated_at: "2026-10-16T00:00:00.000Z",
        } as unknown as Parameters<typeof contactCsvRow>[0],
        ["note"],
      );
    expect(parseContactCsv(csv, types).entries[0]?.entry.properties).toEqual({ note: "  hello " });
  });

  test("a CSV status the import can't set is reported, never imported as subscribed", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const { entries } = parseContactCsv(
      "email,status\r\npending@example.com,pending\r\nfan@example.com,yes\r\n",
      new Map(),
    );
    const result = await importContacts(
      env,
      entries.map(({ entry }) => entry),
      {},
    );
    expect(result).toMatchObject({ created: 1 });
    expect(result.invalid).toMatchObject([{ index: 0, email: "pending@example.com" }]);
    expect(await getContact(env, "pending@example.com")).toBeNull();
  });
});

describe("properties", () => {
  test("keys are unique, limited to 50, and deleting one strips it from contacts", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const plan = await createContactProperty(env, {
      key: "plan",
      type: "string",
      fallback: "free",
    });
    await expect(createContactProperty(env, { key: "plan", type: "number" })).rejects.toMatchObject(
      {
        code: "property_exists",
      },
    );
    await upsert(env, { email: "a@example.com", properties: { plan: "pro" } });
    expect(await deleteContactProperty(env, plan.id)).toBe(true);
    expect((await getContact(env, "a@example.com"))?.properties).toEqual({});
    expect(await listContactProperties(env)).toEqual([]);
  });

  test("a property a segment filters on can't be deleted", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const plan = await createContactProperty(env, { key: "plan", type: "string" });
    await createSegment(env, {
      name: "Pro",
      filter: {
        version: 1,
        match: "all",
        conditions: [{ field: "property", key: "plan", op: "eq", value: "pro" }],
      },
    });
    await expect(deleteContactProperty(env, plan.id)).rejects.toMatchObject({
      code: "property_in_use",
    });
  });
});

describe("audiences and topics", () => {
  test("members are added by id or address, and removed", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const audience = await createAudience(env, { name: "Team" });
    await expect(createAudience(env, { name: "Team" })).rejects.toMatchObject({
      code: "name_taken",
    });
    const { contact } = await upsert(env, { email: "a@example.com" });
    await upsert(env, { email: "b@example.com" });
    expect(
      await addAudienceContacts(env, audience.id, [contact.id, "B@example.com", "c@example.com"]),
    ).toEqual({ object: "audience_contacts", added: 2, existing: 0, missing: ["c@example.com"] });
    expect(await addAudienceContacts(env, audience.id, [contact.id])).toMatchObject({
      added: 0,
      existing: 1,
    });
    expect(await removeAudienceContact(env, audience.id, "b@example.com")).toBe(true);
    expect((await listAudienceContacts(env, audience.id, {}))?.data.map((c) => c.id)).toEqual([
      contact.id,
    ]);
    // Another environment's audience is not found.
    expect(
      await addAudienceContacts(envOf(tenant, "development"), audience.id, [contact.id]),
    ).toBeNull();
  });

  test("a contact's topics: the default unless they chose, never while unsubscribed", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createTopic(env, { key: "news", name: "News", default_subscription: "opt_in" });
    await createTopic(env, { key: "beta", name: "Beta", default_subscription: "opt_out" });
    await expect(
      createTopic(env, { key: "news", name: "Again", default_subscription: "opt_in" }),
    ).rejects.toMatchObject({ code: "topic_exists" });
    const { contact } = await upsert(env, {
      email: "a@example.com",
      topics: [{ topic: "beta", status: "opted_in" }],
    });
    expect((await getContactTopics(env, contact.id))?.topics).toEqual([
      { topic: "beta", name: "Beta", subscribed: true, choice: "opted_in" },
      { topic: "news", name: "News", subscribed: true, choice: null },
    ]);
    await setContactTopics(env, contact.id, [{ topic: "news", status: "opted_out" }], api);
    await updateContact(env, contact.id, { status: "unsubscribed" }, api);
    expect((await getContactTopics(env, contact.id))?.topics).toEqual([
      { topic: "beta", name: "Beta", subscribed: false, choice: "opted_in" },
      { topic: "news", name: "News", subscribed: false, choice: "opted_out" },
    ]);
    await expect(
      upsert(env, { email: "a@example.com", topics: [{ topic: "nope", status: "opted_in" }] }),
    ).rejects.toMatchObject({ code: "topic_not_found", param: "topics.0.topic" });
  });
});

describe("segments", () => {
  async function fixture() {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    await createContactProperty(env, { key: "plan", type: "string" });
    await createContactProperty(env, { key: "seats", type: "number" });
    await createContactProperty(env, { key: "vip", type: "boolean" });
    await createContactProperty(env, { key: "renews", type: "date" });
    const audience = await createAudience(env, { name: "Beta" });
    await createTopic(env, { key: "news", name: "News", default_subscription: "opt_in" });
    const people = {
      ada: await upsert(env, {
        email: "ada@acme.com",
        properties: { plan: "Pro", seats: 10, vip: true, renews: "2027-01-01" },
        audience_ids: [audience.id],
      }),
      grace: await upsert(env, {
        email: "grace@navy.mil",
        properties: { plan: "free", seats: 1 },
        topics: [{ topic: "news", status: "opted_out" }],
      }),
      alan: await upsert(env, { email: "alan@acme.com", properties: { seats: 3 } }),
    };
    return { env, audience, people };
  }

  async function matching(env: ReturnType<typeof envOf>, filter: SegmentFilterOutput) {
    const { data } = await previewSegmentContacts(env, filter, {});
    return data.map((c) => c.email.split("@")[0]).sort();
  }

  const one = (condition: SegmentFilterOutput["conditions"][number]): SegmentFilterOutput => ({
    version: 1,
    match: "all",
    conditions: [condition],
  });

  test("every operator matches what it says", async () => {
    const { env, audience } = await fixture();
    expect(
      await matching(env, one({ field: "property", key: "plan", op: "eq", value: "free" })),
    ).toEqual(["grace"]);
    expect(
      await matching(env, one({ field: "property", key: "plan", op: "neq", value: "free" })),
    ).toEqual(["ada", "alan"]);
    expect(
      await matching(
        env,
        one({ field: "property", key: "plan", op: "in", value: ["free", "Pro"] }),
      ),
    ).toEqual(["ada", "grace"]);
    expect(
      await matching(env, one({ field: "property", key: "plan", op: "contains", value: "RO" })),
    ).toEqual(["ada"]);
    expect(
      await matching(env, one({ field: "property", key: "plan", op: "starts_with", value: "fr" })),
    ).toEqual(["grace"]);
    // Prefixes count characters, not UTF-16 units.
    await upsert(env, { email: "party@acme.com", properties: { plan: "\u{1F389}sale" } });
    expect(
      await matching(
        env,
        one({ field: "property", key: "plan", op: "starts_with", value: "\u{1F389}" }),
      ),
    ).toEqual(["party"]);
    await deleteContact(env, "party@acme.com", { source: "api" });
    expect(
      await matching(env, one({ field: "property", key: "seats", op: "gte", value: 3 })),
    ).toEqual(["ada", "alan"]);
    expect(
      await matching(env, one({ field: "property", key: "seats", op: "lt", value: 3 })),
    ).toEqual(["grace"]);
    expect(
      await matching(env, one({ field: "property", key: "vip", op: "eq", value: true })),
    ).toEqual(["ada"]);
    expect(await matching(env, one({ field: "property", key: "plan", op: "not_exists" }))).toEqual([
      "alan",
    ]);
    expect(
      await matching(env, one({ field: "property", key: "renews", op: "gt", value: "2026-12-31" })),
    ).toEqual(["ada"]);
    expect(
      await matching(env, one({ field: "email", op: "ends_with", value: "@ACME.com" })),
    ).toEqual(["ada", "alan"]);
    expect(
      await matching(env, one({ field: "audience", op: "not_in", audience_id: audience.id })),
    ).toEqual(["alan", "grace"]);
    expect(await matching(env, one({ field: "topic", op: "subscribed", topic: "news" }))).toEqual([
      "ada",
      "alan",
    ]);
    expect(await matching(env, one({ field: "created_at", op: "within_days", value: 1 }))).toEqual([
      "ada",
      "alan",
      "grace",
    ]);
    expect(
      await matching(env, {
        version: 1,
        match: "all",
        conditions: [
          { field: "email", op: "ends_with", value: "@acme.com" },
          {
            match: "any",
            conditions: [
              { field: "property", key: "vip", op: "eq", value: true },
              { field: "property", key: "seats", op: "eq", value: 3 },
            ],
          },
        ],
      }),
    ).toEqual(["ada", "alan"]);
  });

  test("values are bound and references validated: injection attempts match nothing", async () => {
    const { env } = await fixture();
    expect(
      await matching(env, one({ field: "property", key: "plan", op: "eq", value: "x' or '1'='1" })),
    ).toEqual([]);
    expect(await matching(env, one({ field: "email", op: "eq", value: "' or 1=1 --" }))).toEqual(
      [],
    );
    await expect(
      createSegment(env, {
        name: "Bad",
        filter: one({ field: "property", key: "plan'); drop table contact; --", op: "exists" }),
      }),
    ).rejects.toMatchObject({ code: "invalid_filter", param: "filter.conditions.0.key" });
    await expect(
      createSegment(env, {
        name: "Bad",
        filter: one({ field: "property", key: "vip", op: "contains", value: "x" }),
      }),
    ).rejects.toMatchObject({ code: "invalid_filter", param: "filter.conditions.0.op" });
    await expect(
      createSegment(env, {
        name: "Bad",
        filter: one({ field: "audience", op: "in", audience_id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz" }),
      }),
    ).rejects.toMatchObject({ code: "invalid_filter" });
  });

  test("more concurrent segment saves than pool connections all finish", async () => {
    const { env, audience } = await fixture();
    const saves = Array.from({ length: 15 }, (_, index) =>
      createSegment(env, {
        name: `Concurrent ${index}`,
        filter: one({ field: "audience", op: "in", audience_id: audience.id }),
      }),
    );
    expect(await Promise.all(saves)).toHaveLength(15);
  });

  test("audiences and topics a segment uses can't be deleted until it changes", async () => {
    const { env, audience } = await fixture();
    const topic = await createTopic(env, {
      key: "beta",
      name: "Beta",
      default_subscription: "opt_out",
    });
    const segment = await createSegment(env, {
      name: "Beta testers",
      filter: {
        version: 1,
        match: "any",
        conditions: [
          { field: "audience", op: "in", audience_id: audience.id },
          { field: "topic", op: "subscribed", topic: "beta" },
        ],
      },
    });
    await expect(deleteAudience(env, audience.id)).rejects.toMatchObject({
      code: "audience_in_use",
    });
    await expect(deleteTopic(env, topic.id)).rejects.toMatchObject({ code: "topic_in_use" });
    await deleteSegment(env, segment.id);
    expect(await deleteAudience(env, audience.id)).toBe(true);
    expect(await deleteTopic(env, topic.id)).toBe(true);
  });
});

describe("recipient resolution", () => {
  test("only subscribed, unsuppressed contacts the topic reaches, a page at a time", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    const audience = await createAudience(env, { name: "All" });
    await createTopic(env, { key: "news", name: "News", default_subscription: "opt_in" });
    await createTopic(env, { key: "beta", name: "Beta", default_subscription: "opt_out" });
    const add = (email: string, extra: Record<string, unknown> = {}) =>
      upsert(env, { email, audience_ids: [audience.id], ...extra });
    await add("ok1@example.com", { topics: [{ topic: "beta", status: "opted_in" }] });
    await add("ok2@example.com");
    await add("unsubscribed@example.com", { status: "unsubscribed" });
    await add("bounced@example.com");
    await add("complained@example.com");
    await add("category@example.com");
    await add("optedout@example.com", { topics: [{ topic: "news", status: "opted_out" }] });
    await upsert(env, { email: "outsider@example.com" });
    await db
      .update(schema.contact)
      .set({ status: "pending" })
      .where(
        and(
          eq(schema.contact.environmentId, env.environmentId),
          eq(schema.contact.address, "ok2@example.com"),
        ),
      );
    await add("ok3@example.com");
    await addSuppression(env, { address: "bounced@example.com", scope: "*" });
    await addSuppression(env, { address: "complained@example.com", scope: "stream:marketing" });
    await addSuppression(env, { address: "category@example.com", scope: "news" });
    // A sub-account's list is about its own mail: the environment's audience still has them.
    const subaccount = await createSubaccount({ ...env, name: "A" });
    await addSuppression(
      { ...env, subaccountId: subaccount.id },
      { address: "ok3@example.com", scope: "*" },
    );
    const target = { audienceId: audience.id };
    const local = (list: { address: string }[]) => list.map((r) => r.address.split("@")[0]).sort();

    const general = await resolveRecipients(env, target, {});
    expect(local(general.recipients)).toEqual(["category", "ok1", "ok3", "optedout"]);
    const news = await resolveRecipients(env, target, { topic: "news" });
    expect(local(news.recipients)).toEqual(["ok1", "ok3"]);
    const beta = await resolveRecipients(env, target, { topic: "beta" });
    expect(local(beta.recipients)).toEqual(["ok1"]);
    expect(await countRecipients(env, target, { topic: "news" })).toBe(2);

    const first = await resolveRecipients(env, target, { limit: 1 });
    expect(first.next).toBe(first.recipients[0]?.id ?? null);
    const rest = await resolveRecipients(env, target, { after: first.next ?? undefined });
    expect(rest.recipients).toHaveLength(3);
    // Contacts created after the fan-out started are left out.
    const bounded = await resolveRecipients(env, target, { before: first.next ?? undefined });
    expect(bounded.recipients).toEqual([]);
  });
});

describe("marketing settings", () => {
  test("fields change one at a time and clear with null", async () => {
    const tenant = await createTestTenant();
    const env = envOf(tenant);
    expect(await getMarketingSettings(env)).toEqual({
      object: "marketing_settings",
      display_name: null,
      mailing_address: null,
      double_opt_in_default: false,
      confirmation_from: null,
      confirmation_subject: null,
      confirmation_html: null,
      confirmation_text: null,
      confirmed_redirect_url: null,
    });
    await updateMarketingSettings(env, { mailing_address: "1 Main St, Springfield" });
    await updateMarketingSettings(env, { display_name: "Acme" });
    expect(await getMarketingSettings(env)).toMatchObject({
      display_name: "Acme",
      mailing_address: "1 Main St, Springfield",
    });
    await updateMarketingSettings(env, { display_name: null });
    expect((await getMarketingSettings(env)).display_name).toBeNull();
  });
});

test("a ContactError is what callers catch", () => {
  expect(new ContactError("not_found", "x")).toBeInstanceOf(Error);
});
