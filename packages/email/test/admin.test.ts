import { describe, expect, test } from "bun:test";
import { db, schema } from "@coss/db";
import { newId } from "@coss/db/id";
import { createTestTenant } from "@coss/tenancy/testing";
import {
  getEmailContentForAdmin,
  getEmailForAdmin,
  listEmailsForAdmin,
  listSendersForAdmin,
  platformEmailStats,
} from "../src/admin.ts";
import { FakeEmailProvider } from "../src/providers/fake.ts";
import { dispatchingEmailService } from "../src/testing.ts";
import { params, sendEnvironment, verifiedFrom } from "./helpers.ts";

const provider = new FakeEmailProvider({ log: false });
const service = dispatchingEmailService({ liveProvider: provider, sandboxProvider: provider });

/** Two organizations: a customer that sends live and sandbox email, and coss.com's own. */
async function fixture() {
  const customer = await createTestTenant();
  const coss = await createTestTenant();
  // A window around the test: `now` defaults to the app's clock (milliseconds), so a row Postgres
  // stamps (microseconds) in the same millisecond as the read would fall outside it.
  const since = new Date(Date.now() - 60_000);
  const now = new Date(Date.now() + 60_000);
  const from = await verifiedFrom(customer.organization.id);
  const live = [];
  for (const subject of ["Win a prize", "Claim now"]) {
    live.push(
      (
        await service.send({
          environment: sendEnvironment(customer.production),
          apiKeyId: null,
          params: params({ from, subject, to: ["a@example.com", "b@example.com"] }),
        })
      ).email,
    );
  }
  const sandbox = (
    await service.send({
      environment: sendEnvironment(customer.development),
      apiKeyId: null,
      params: params({ subject: "Sandboxed" }),
    })
  ).email;
  const cossLive = (
    await service.send({
      environment: sendEnvironment(coss.production),
      apiKeyId: null,
      params: params({ from: await verifiedFrom(coss.organization.id) }),
    })
  ).email;
  const [first, second] = live;
  if (!first || !second) throw new Error("expected two live emails");
  const scope = { organizationIds: [customer.organization.id, coss.organization.id] };
  return { customer, coss, since, now, live: [first, second] as const, sandbox, cossLive, scope };
}

describe("platformEmailStats", () => {
  test("counts live and sandbox emails, coss.com's own apart", async () => {
    const { coss, since, now, scope } = await fixture();
    const stats = await platformEmailStats({
      since,
      now,
      systemOrganizationId: coss.organization.id,
      scope,
    });
    expect(stats.customers.live.sent).toBe(2);
    expect(stats.customers.sandbox).toBe(1);
    expect(stats.customers.liveSenders).toBe(1);
    expect(stats.coss.live.sent).toBe(1);
    expect(stats.coss.liveSenders).toBe(1);

    const unsplit = await platformEmailStats({ since, now, systemOrganizationId: null, scope });
    expect(unsplit.customers.live.sent).toBe(3);
    expect(unsplit.customers.liveSenders).toBe(2);
    expect(unsplit.coss.live.sent).toBe(0);
  });
});

describe("listSendersForAdmin", () => {
  test("ranks organizations by live emails sent, with their standing and screenings", async () => {
    const { customer, coss, since, now, live, scope } = await fixture();
    await db.insert(schema.contentScreening).values({
      organizationId: customer.organization.id,
      environmentId: customer.production.id,
      product: "email",
      subjectId: live[0].id,
      sequence: 1,
      classifier: "fake",
      verdict: "flagged",
      topCategory: "phishing",
      topScore: 0.9,
      latencyMs: 1,
      // The admin range ends at JS millisecond precision; avoid a DB submillisecond timestamp
      // just beyond it when the insert and read happen within the same millisecond.
      createdAt: new Date(Date.now() - 1000),
    });

    const senders = await listSendersForAdmin({ since, now, scope });
    expect(senders.map((row) => row.organizationId)).toEqual([
      customer.organization.id,
      coss.organization.id,
    ]);
    expect(senders[0]).toMatchObject({
      slug: customer.organization.slug,
      ownerEmail: customer.owner.email,
      verifiedDomains: 1,
      liveSent: 2,
      liveRecipients: 4,
      liveFailed: 0,
      sandbox: 1,
      screeningFlagged: 1,
      screeningBlocked: 0,
      standingStatus: "good",
      suspended: false,
      deleting: false,
    });

    expect(
      (
        await listSendersForAdmin({
          since,
          now,
          excludeOrganizationId: coss.organization.id,
          scope,
        })
      ).map((row) => row.organizationId),
    ).toEqual([customer.organization.id]);
    expect(
      (await listSendersForAdmin({ since, now, organizationId: coss.organization.id, scope })).map(
        (row) => row.organizationId,
      ),
    ).toEqual([coss.organization.id]);
    expect(await listSendersForAdmin({ since: new Date(), scope })).toEqual([]);
  });
});

describe("listEmailsForAdmin", () => {
  test("lists every organization's emails newest first, filtered and paged", async () => {
    const { customer, coss, live, sandbox, cossLive, scope } = await fixture();

    const all = await listEmailsForAdmin({ scope });
    expect(all.items.map((item) => item.id)).toEqual([
      cossLive.id,
      sandbox.id,
      live[1].id,
      live[0].id,
    ]);
    expect(all.nextCursor).toBeNull();
    expect(all.items[2]).toMatchObject({
      organizationId: customer.organization.id,
      organizationSlug: customer.organization.slug,
      mode: "live",
      subject: "Claim now",
      recipients: 2,
      status: "sent",
      screening: null,
    });
    // Never the content.
    expect(all.items[0]).not.toHaveProperty("html");

    const first = await listEmailsForAdmin({ scope, limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBe(live[1].id);
    const second = await listEmailsForAdmin({ scope, limit: 3, before: first.nextCursor ?? "" });
    expect(second.items.map((item) => item.id)).toEqual([live[0].id]);

    const ids = async (filters: Parameters<typeof listEmailsForAdmin>[0]) =>
      (await listEmailsForAdmin({ scope, ...filters })).items.map((item) => item.id);
    expect(await ids({ mode: "sandbox" })).toEqual([sandbox.id]);
    expect(await ids({ organizationId: coss.organization.id })).toEqual([cossLive.id]);
    expect(await ids({ status: "failed" })).toEqual([]);
    expect(await ids({ from: live[0].from.split("@")[1] ?? "" })).toEqual([live[1].id, live[0].id]);
    expect(await ids({ from: "100%_" })).toEqual([]);
    expect(await ids({ before: "nope" })).toEqual([]);
  });
});

describe("getEmailForAdmin / getEmailContentForAdmin", () => {
  test("resolve any organization's email; only the content read returns its body", async () => {
    const { customer, live } = await fixture();
    const id = live[0].id;
    expect(await getEmailForAdmin(id)).toMatchObject({
      organizationId: customer.organization.id,
      environmentId: customer.production.id,
      mode: "live",
      apiKeyId: null,
      apiKeyName: null,
    });
    expect(await getEmailForAdmin(id)).not.toHaveProperty("html");
    expect(await getEmailContentForAdmin(id)).toEqual({
      organizationId: customer.organization.id,
      html: live[0].html,
      text: live[0].text,
    });
    for (const unknown of [newId("email"), "nope"]) {
      expect(await getEmailForAdmin(unknown)).toBeNull();
      expect(await getEmailContentForAdmin(unknown)).toBeNull();
    }
  });
});
