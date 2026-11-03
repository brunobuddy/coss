import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { db, schema } from "@coss/db";
import {
  addMember,
  createTestTenant,
  createTestUser,
  type TestTenant,
} from "@coss/tenancy/testing";
import { eq } from "drizzle-orm";
import { ingestSupportEmails, SUPPORT_FLOOD_LIMIT } from "../src/intake.ts";
import { fixedSupportPlans } from "../src/testing.ts";
import { intakeDeps, messagesOf, receive, ticketFrom } from "./helpers.ts";

const { domain, supportIntake, supportTicket, user } = schema;

let desk: TestTenant;

beforeAll(async () => {
  desk = await createTestTenant();
});

async function customerMessageOf(ticketId: string) {
  return (await messagesOf(ticketId)).find((message) => message.kind === "customer");
}

async function ingest(planFor = fixedSupportPlans()) {
  // One environment per file, so this only ever sees this file's mail.
  while (
    (await ingestSupportEmails({ limit: 100 }, intakeDeps(desk.production.id, planFor))) === 100
  );
}

describe("identity", () => {
  test("a proven sender with one organization is confirmed", async () => {
    const customer = await createTestTenant();
    const id = await receive(desk, { from: customer.owner.email });
    await ingest(fixedSupportPlans({ [customer.organization.id]: "scale" }));
    const ticket = await ticketFrom(id);
    expect(ticket.organizationId).toBe(customer.organization.id);
    expect(ticket.organizationName).toBe(customer.organization.name);
    expect(ticket.orgMatch).toBe("email");
    expect(ticket.requesterUserId).toBe(customer.owner.id);
    expect(ticket.plan).toBe("scale");
    expect(ticket.senderAuth).toBe("dmarc_pass");
    expect(ticket.status).toBe("open");
    expect(ticket.responseDueAt).not.toBeNull();
    const message = await customerMessageOf(ticket.id);
    expect(message?.customerVisible).toBe(true);
    expect(message?.visibleText).toBe("My domain won't verify.");
  });

  test("a forged From never confirms an organization", async () => {
    const customer = await createTestTenant();
    const id = await receive(desk, { from: customer.owner.email, dmarc: "fail" });
    await ingest(fixedSupportPlans({ [customer.organization.id]: "enterprise" }));
    const ticket = await ticketFrom(id);
    expect(ticket.organizationId).toBeNull();
    expect(ticket.requesterUserId).toBeNull();
    expect(ticket.suggestedOrganizationId).toBe(customer.organization.id);
    expect(ticket.senderAuth).toBe("unverified");
    // The rep still sees who it might be, and the provisional plan orders the queue.
    expect(ticket.plan).toBe("enterprise");
    const messages = await messagesOf(ticket.id);
    expect(messages.map((message) => message.customerVisible)).toEqual([false]);
    // No acknowledgement: this address may never have written to us.
    expect(messages.some((message) => message.event === "acknowledged")).toBe(false);
  });

  test("multiple From addresses are unverified despite a DMARC pass", async () => {
    const customer = await createTestTenant();
    const id = await receive(desk, {
      from: customer.owner.email,
      fromHeader: `${customer.owner.email}, attacker@evil.test`,
    });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.senderAuth).toBe("unverified");
    expect(ticket.organizationId).toBeNull();
  });

  test("an unverified account matches nothing", async () => {
    const unverified = await createTestUser({ emailVerified: false });
    const id = await receive(desk, { from: unverified.email });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.requesterUserId).toBeNull();
    expect(ticket.organizationId).toBeNull();
    expect(ticket.suggestedOrganizationId).toBeNull();
    expect(ticket.plan).toBe("free");
  });

  test("a banned account matches nothing", async () => {
    const customer = await createTestTenant();
    await db.update(user).set({ banned: true }).where(eq(user.id, customer.owner.id));
    const id = await receive(desk, { from: customer.owner.email });
    await ingest();
    expect((await ticketFrom(id)).organizationId).toBeNull();
  });

  test("several organizations are suggested at the highest plan, never confirmed", async () => {
    const first = await createTestTenant();
    const second = await createTestTenant();
    await addMember({
      organizationId: second.organization.id,
      userId: first.owner.id,
      role: "member",
    });
    const id = await receive(desk, { from: first.owner.email });
    await ingest(
      fixedSupportPlans({ [first.organization.id]: "pro", [second.organization.id]: "scale" }),
    );
    const ticket = await ticketFrom(id);
    expect(ticket.organizationId).toBeNull();
    expect(ticket.suggestedOrganizationId).toBe(second.organization.id);
    expect(ticket.plan).toBe("scale");
    expect(ticket.requesterUserId).toBe(first.owner.id);
  });

  test("a verified sending domain only suggests", async () => {
    const customer = await createTestTenant();
    const name = `support-test-${customer.organization.id.slice(-10)}.example`;
    await db.insert(domain).values({
      organizationId: customer.organization.id,
      name,
      status: "verified",
      provider: "fake",
      mailFromDomain: `send.${name}`,
      region: "us-east-2",
      records: [],
    });
    const id = await receive(desk, { from: `colleague@${name}` });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.organizationId).toBeNull();
    expect(ticket.suggestedOrganizationId).toBe(customer.organization.id);
  });

  test("a pending domain suggests nothing", async () => {
    const customer = await createTestTenant();
    const name = `pending-${customer.organization.id.slice(-10)}.example`;
    await db.insert(domain).values({
      organizationId: customer.organization.id,
      name,
      status: "pending",
      provider: "fake",
      mailFromDomain: `send.${name}`,
      region: "us-east-2",
      records: [],
    });
    const id = await receive(desk, { from: `someone@${name}` });
    await ingest();
    expect((await ticketFrom(id)).suggestedOrganizationId).toBeNull();
  });

  test("a free mail provider's domain suggests nothing", async () => {
    const id = await receive(desk, { from: `stranger-${Date.now()}@gmail.com` });
    await ingest();
    expect((await ticketFrom(id)).suggestedOrganizationId).toBeNull();
  });
});

describe("replies to", () => {
  test("Cc from authenticated mail is copied", async () => {
    const id = await receive(desk, { cc: ["colleague@example.test"] });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.cc).toEqual(["colleague@example.test"]);
    expect(ticket.suggestedCc).toEqual([]);
  });

  test("Cc from unauthenticated mail waits for a rep", async () => {
    const id = await receive(desk, { dmarc: "gray", cc: ["attacker@evil.test"] });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.cc).toEqual([]);
    expect(ticket.suggestedCc).toEqual(["attacker@evil.test"]);
  });

  test("the Reply-To header is ignored", async () => {
    const from = `ada-replyto-${Date.now()}@example.test`;
    const id = await receive(desk, { from, replyTo: ["attacker@evil.test"] });
    await ingest();
    expect((await ticketFrom(id)).requesterEmail).toBe(from);
  });

  test("our own support addresses never join the thread", async () => {
    const id = await receive(desk, {
      to: ["support@coss.com", "support@reply.coss.test", "other@example.test"],
    });
    await ingest();
    expect((await ticketFrom(id)).cc).toEqual(["other@example.test"]);
  });
});

describe("threading", () => {
  test("a reply with the token joins its ticket", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    const reply = await receive(desk, {
      from: ticket.requesterEmail,
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
      subject: "Totally different",
    });
    await ingest();
    expect((await ticketFrom(reply)).id).toBe(ticket.id);
  });

  test("a reply with a known Message-ID joins its ticket", async () => {
    const first = await receive(desk, { messageId: `<thread-${Date.now()}@example.test>` });
    await ingest();
    const ticket = await ticketFrom(first);
    const message = await customerMessageOf(ticket.id);
    const reply = await receive(desk, {
      from: ticket.requesterEmail,
      inReplyTo: message?.rfcMessageId ?? null,
    });
    await ingest();
    expect((await ticketFrom(reply)).id).toBe(ticket.id);
  });

  test("the same subject from the same sender never merges", async () => {
    const from = `same-subject-${Date.now()}@example.test`;
    const first = await receive(desk, { from, subject: "Help" });
    const second = await receive(desk, { from, subject: "Help" });
    await ingest();
    expect((await ticketFrom(first)).id).not.toBe((await ticketFrom(second)).id);
  });

  test("the number in a subject is not a way in", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    const other = await receive(desk, { subject: `Re: Help [#${ticket.number}]` });
    await ingest();
    expect((await ticketFrom(other)).id).not.toBe(ticket.id);
  });

  test("one message arriving by both paths is filed once", async () => {
    const messageId = `<both-${Date.now()}@example.test>`;
    const first = await receive(desk, { messageId });
    await ingest();
    const ticket = await ticketFrom(first);
    await receive(desk, {
      from: ticket.requesterEmail,
      messageId,
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
    });
    await ingest();
    const customer = (await messagesOf(ticket.id)).filter((m) => m.kind === "customer");
    expect(customer).toHaveLength(1);
  });

  test("a leaked token posts rep-only, even with DMARC", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    const reply = await receive(desk, {
      from: "attacker@evil.test",
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
    });
    await ingest();
    const messages = await messagesOf(ticket.id);
    const injected = messages.find((message) => message.receivedEmailId === reply);
    expect(injected?.customerVisible).toBe(false);
  });

  test("a forged reply from the requester's address stays rep-only", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    const reply = await receive(desk, {
      from: ticket.requesterEmail,
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
      dmarc: "fail",
      cc: ["attacker@evil.test"],
    });
    await ingest();
    const messages = await messagesOf(ticket.id);
    expect(messages.find((m) => m.receivedEmailId === reply)?.customerVisible).toBe(false);
    const [updated] = await db.select().from(supportTicket).where(eq(supportTicket.id, ticket.id));
    expect(updated?.cc).not.toContain("attacker@evil.test");
    expect(updated?.suggestedCc).toContain("attacker@evil.test");
  });
});

describe("filtering", () => {
  test("spam goes to Spam with no acknowledgement", async () => {
    const id = await receive(desk, { spam: "fail" });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.status).toBe("spam");
    expect(ticket.filterReason).toBe("spam");
    expect(ticket.responseDueAt).toBeNull();
    const messages = await messagesOf(ticket.id);
    expect(messages.some((m) => m.event === "acknowledged")).toBe(false);
    expect(messages.some((m) => m.repAlertPending)).toBe(false);
  });

  test("an auto-responder opens nothing and gets no answer", async () => {
    const id = await receive(desk, {
      headers: [
        { name: "From", value: "ooo@example.test" },
        { name: "Auto-Submitted", value: "auto-replied" },
      ],
      from: "ooo@example.test",
    });
    await ingest();
    const ticket = await ticketFrom(id);
    expect(ticket.status).toBe("spam");
    expect(ticket.filterReason).toBe("auto");
    expect((await messagesOf(ticket.id)).some((m) => m.event === "acknowledged")).toBe(false);
  });

  test("an auto-reply never reopens a ticket", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    await db
      .update(supportTicket)
      .set({ status: "resolved" })
      .where(eq(supportTicket.id, ticket.id));
    await receive(desk, {
      from: ticket.requesterEmail,
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
      headers: [
        { name: "From", value: ticket.requesterEmail },
        { name: "Auto-Submitted", value: "auto-replied" },
      ],
    });
    await ingest();
    const [updated] = await db.select().from(supportTicket).where(eq(supportTicket.id, ticket.id));
    expect(updated?.status).toBe("resolved");
    const messages = await messagesOf(ticket.id);
    const filed = messages.at(-1);
    expect(filed?.lowSignal).toBe(true);
    expect(filed?.repAlertPending).toBe(false);
  });

  test("a bounce to the reply address is filed", async () => {
    const first = await receive(desk);
    await ingest();
    const ticket = await ticketFrom(first);
    await receive(desk, {
      from: "mailer-daemon@example.test",
      mailFrom: "",
      recipients: [`support+${ticket.replyToken}@reply.coss.test`],
    });
    await ingest();
    expect((await messagesOf(ticket.id)).at(-1)?.lowSignal).toBe(true);
  });

  test("mail from our own address is a loop, and dropped", async () => {
    const id = await receive(desk, { from: "support@coss.com" });
    await ingest();
    const [intake] = await db
      .select()
      .from(supportIntake)
      .where(eq(supportIntake.receivedEmailId, id));
    expect(intake?.outcome).toBe("no_sender");
    expect(intake?.settledAt).not.toBeNull();
  });

  test("other addresses at the domain make no ticket", async () => {
    const id = await receive(desk, { recipients: ["sales@reply.coss.test"] });
    await ingest();
    const [intake] = await db
      .select()
      .from(supportIntake)
      .where(eq(supportIntake.receivedEmailId, id));
    expect(intake?.outcome).toBe("not_support");
  });

  test("a flood from one address goes to Spam", async () => {
    const from = `flood-${Date.now()}@example.test`;
    for (let index = 0; index < SUPPORT_FLOOD_LIMIT; index++) await receive(desk, { from });
    await ingest();
    const last = await receive(desk, { from });
    await ingest();
    const ticket = await ticketFrom(last);
    expect(ticket.status).toBe("spam");
    expect(ticket.filterReason).toBe("flood");
  });

  test("HTML-only mail keeps its text", async () => {
    const id = await receive(desk, { text: null, html: "<p>Only <b>HTML</b> here</p>" });
    await ingest();
    const message = await customerMessageOf((await ticketFrom(id)).id);
    expect(message?.body).toContain("Only HTML here");
  });

  test("quoted history is left out of the visible text", async () => {
    const id = await receive(desk, {
      text: "Thanks!\n\nOn Tue, Nov 3, 2026 at 1:00 PM Bailey wrote:\n> Hello",
    });
    await ingest();
    const message = await customerMessageOf((await ticketFrom(id)).id);
    expect(message?.visibleText).toBe("Thanks!");
    expect(message?.body).toContain("> Hello");
  });

  test("a message without a subject still files", async () => {
    const id = await receive(desk, { subject: "   " });
    await ingest();
    expect((await ticketFrom(id)).subject).toBe("(no subject)");
  });
});

describe("failures", () => {
  test("a message that keeps failing doesn't block others and is set aside", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const local = await createTestTenant();
    const poison = await receive(local, { subject: "Poison" });
    const healthy = await receive(local, { subject: "Healthy" });
    const deps = {
      ...intakeDeps(local.production.id),
      extractReplyText(text: string) {
        if (text === "boom") throw new Error("boom");
        return text;
      },
    };
    await db
      .update(schema.receivedEmail)
      .set({ text: "boom" })
      .where(eq(schema.receivedEmail.id, poison));
    let now = new Date();
    for (let attempt = 0; attempt < 6; attempt++) {
      await ingestSupportEmails({ limit: 10, now }, deps);
      now = new Date(now.getTime() + 60 * 60 * 1000);
    }
    expect((await ticketFrom(healthy)).subject).toBe("Healthy");
    const [record] = await db
      .select()
      .from(supportIntake)
      .where(eq(supportIntake.receivedEmailId, poison));
    expect(record?.outcome).toBe("failed");
    expect(record?.attempts).toBe(5);
    expect(record?.lastError).toBe("boom");
    quiet.mockRestore();
  });

  test("two workers file a message once", async () => {
    const local = await createTestTenant();
    const id = await receive(local);
    const deps = intakeDeps(local.production.id);
    await Promise.all([
      ingestSupportEmails({ limit: 10 }, deps),
      ingestSupportEmails({ limit: 10 }, deps),
    ]);
    const ticket = await ticketFrom(id);
    expect((await messagesOf(ticket.id)).filter((m) => m.kind === "customer")).toHaveLength(1);
  });
});
