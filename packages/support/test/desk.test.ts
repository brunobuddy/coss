import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { db, schema } from "@coss/db";
import { deleteUserAccount } from "@coss/tenancy";
import {
  addMember,
  createTestTenant,
  createTestUser,
  type TestTenant,
} from "@coss/tenancy/testing";
import { and, eq } from "drizzle-orm";
import {
  acceptSuggestedCc,
  addSupportNote,
  assignSupportTicket,
  confirmSupportOrganization,
  listSupportQueue,
  markSupportNotSpam,
  markSupportSpam,
  replyAsAgent,
  setSupportSeverity,
  setSupportStatus,
} from "../src/admin.ts";
import {
  PermanentSupportSendError,
  runDueSupportDeliveries,
  supportSubject,
  syncSupportDeliveries,
} from "../src/delivery.ts";
import { ingestSupportEmails } from "../src/intake.ts";
import { FakeSupportFileStore, supportFileKey } from "../src/store.ts";
import {
  autoResolveQuietTickets,
  copySupportAttachments,
  enqueueSupportAlerts,
  purgeExpiredSupportTickets,
  purgeSupportLeftovers,
  SUPPORT_ALERT_KINDS,
  SUPPORT_NOTIFICATION_KINDS,
  wakeSnoozedTickets,
} from "../src/sweep.ts";
import { fixedSupportPlans, recordingSupportMailer } from "../src/testing.ts";
import {
  type CustomerScope,
  countUnreadCustomerTickets,
  createDashboardTicket,
  getCustomerAttachment,
  getCustomerTicket,
  listCustomerTickets,
  markCustomerTicketRead,
  reopenAsCustomer,
  replyAsCustomer,
  resolveAsCustomer,
} from "../src/tickets.ts";
import {
  intakeDeps,
  messagesOf,
  pendingDeliveries,
  receive,
  rep,
  ticketById,
  ticketFrom,
} from "./helpers.ts";

const { notification, supportAttachment, supportMessage, supportTicket, user } = schema;

const REPLY_DOMAIN = "reply.coss.test";
const DASHBOARD = "https://coss.test";
const store = new FakeSupportFileStore();

let desk: TestTenant;
let customer: TestTenant;
const plans = () => fixedSupportPlans({ [customer.organization.id]: "pro" });

beforeAll(async () => {
  desk = await createTestTenant();
  customer = await createTestTenant();
});

const ownerScope = (): CustomerScope => ({
  organizationId: customer.organization.id,
  userId: customer.owner.id,
  role: "owner",
});

function author(tenant: TestTenant = customer) {
  return { userId: tenant.owner.id, name: "Ada Lovelace", email: tenant.owner.email };
}

async function newTicket(overrides: Partial<Parameters<typeof createDashboardTicket>[0]> = {}) {
  return createDashboardTicket(
    {
      organizationId: customer.organization.id,
      organizationName: customer.organization.name,
      author: author(),
      subject: "Webhooks aren't arriving",
      category: "technical",
      severity: "normal",
      body: "They stopped this morning.",
      ...overrides,
    },
    { planFor: plans() },
  );
}

function deliver(ticketIds: string[], mailer = recordingSupportMailer(), now?: Date) {
  return runDueSupportDeliveries(
    { scope: { ticketIds }, limit: 50, now },
    { mailer, store, replyDomain: REPLY_DOMAIN, dashboardUrl: DASHBOARD },
  ).then(() => mailer);
}

describe("dashboard tickets", () => {
  test("are confirmed, on the clock and acknowledged", async () => {
    const ticket = await newTicket();
    expect(ticket.organizationId).toBe(customer.organization.id);
    expect(ticket.orgMatch).toBe("session");
    expect(ticket.senderAuth).toBe("session");
    expect(ticket.plan).toBe("pro");
    expect(ticket.responseDueAt).not.toBeNull();
    const pending = await pendingDeliveries(ticket.id);
    expect(pending.map((message) => message.event)).toEqual(["acknowledged"]);
  });

  test("urgent is refused on a plan without it", async () => {
    const free = await createTestTenant();
    const ticket = await createDashboardTicket(
      {
        organizationId: free.organization.id,
        organizationName: free.organization.name,
        author: author(free),
        subject: "Everything is down",
        category: "technical",
        severity: "urgent",
        body: "Help",
      },
      { planFor: fixedSupportPlans() },
    );
    expect(ticket.severity).toBe("normal");
  });

  test("a stranger's upload can't be attached", async () => {
    const [upload] = await db
      .insert(supportAttachment)
      .values({
        uploadedByUserId: desk.owner.id,
        filename: "a.txt",
        contentType: "text/plain",
        size: 1,
        state: "stored",
        storeKey: supportFileKey(),
      })
      .returning();
    await expect(newTicket({ attachmentIds: [upload?.id ?? ""] })).rejects.toThrow(
      "no longer available",
    );
  });
});

describe("what customers see", () => {
  test("notes and internal events never appear", async () => {
    const ticket = await newTicket();
    await addSupportNote({
      ticketId: ticket.id,
      author: rep(desk),
      body: "SECRET: customer is on thin ice",
    });
    await assignSupportTicket({
      ticketId: ticket.id,
      assigneeUserId: desk.owner.id,
      assigneeName: "Bailey",
      author: rep(desk),
    });
    const read = await getCustomerTicket(ownerScope(), ticket.id);
    const text = JSON.stringify(read);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("assigned");
    expect(read?.messages.map((m) => m.kind)).toEqual(["customer"]);
  });

  test("notes are never emailed", async () => {
    const ticket = await newTicket();
    await addSupportNote({ ticketId: ticket.id, author: rep(desk), body: "SECRET note" });
    const mailer = await deliver([ticket.id]);
    expect(mailer.sent.map((email) => email.text).join()).not.toContain("SECRET");
    expect(mailer.sent).toHaveLength(1);
  });

  test("a rep is only a first name", async () => {
    const ticket = await newTicket();
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Looking now." });
    const read = await getCustomerTicket(ownerScope(), ticket.id);
    const reply = read?.messages.find((m) => m.fromSupport);
    expect(reply?.authorName).toBe("Bailey");
    expect(JSON.stringify(read)).not.toContain(desk.owner.email);
  });

  test("members see their own tickets, admins see all", async () => {
    const memberUser = await createTestUser();
    await addMember({
      organizationId: customer.organization.id,
      userId: memberUser.id,
      role: "member",
    });
    const ticket = await newTicket();
    const memberScope = {
      organizationId: customer.organization.id,
      userId: memberUser.id,
      role: "member",
    };
    expect(await getCustomerTicket(memberScope, ticket.id)).toBeNull();
    expect((await listCustomerTickets(memberScope)).map((t) => t.id)).not.toContain(ticket.id);
    expect(await getCustomerTicket({ ...memberScope, role: "admin" }, ticket.id)).not.toBeNull();
    const own = await newTicket({
      author: { userId: memberUser.id, name: "Member", email: memberUser.email },
    });
    expect(await getCustomerTicket(memberScope, own.id)).not.toBeNull();
  });

  test("another organization sees nothing", async () => {
    const ticket = await newTicket();
    const other = await createTestTenant();
    const scope = { organizationId: other.organization.id, userId: other.owner.id, role: "owner" };
    expect(await getCustomerTicket(scope, ticket.id)).toBeNull();
    expect((await listCustomerTickets(scope)).map((t) => t.id)).not.toContain(ticket.id);
    // Asking in your own organization for someone else's organization's ticket.
    await expect(
      replyAsCustomer(
        { scope, ticketId: ticket.id, author: author(other), body: "hi" },
        { planFor: plans() },
      ),
    ).rejects.toThrow("doesn't exist");
  });

  test("a forged email's message is invisible until confirmed", async () => {
    const id = await receive(desk, { from: customer.owner.email, dmarc: "fail", text: "Forged" });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(id);
    expect(await getCustomerTicket(ownerScope(), ticket.id)).toBeNull();
    await confirmSupportOrganization(
      { ticketId: ticket.id, organizationId: customer.organization.id, author: rep(desk) },
      { planFor: plans() },
    );
    const read = await getCustomerTicket(ownerScope(), ticket.id);
    expect(read?.messages.map((m) => m.body)).toEqual(["Forged"]);
    const after = await ticketById(ticket.id);
    expect(after.orgMatch).toBe("manual");
    expect(after.requesterUserId).toBe(customer.owner.id);
    expect(after.suggestedOrganizationId).toBeNull();
    expect(after.plan).toBe("pro");
  });

  test("confirming doesn't reveal someone else's injected message", async () => {
    const first = await receive(desk, { dmarc: "gray", text: "Original" });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(first);
    await receive(desk, {
      from: "attacker@evil.test",
      recipients: [`support+${ticket.replyToken}@${REPLY_DOMAIN}`],
      text: "Injected",
    });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    await confirmSupportOrganization(
      { ticketId: ticket.id, organizationId: customer.organization.id, author: rep(desk) },
      { planFor: plans() },
    );
    const read = await getCustomerTicket(ownerScope(), ticket.id);
    expect(read?.messages.map((m) => m.body)).toEqual(["Original"]);
  });

  test("attachments of rep-only messages can't be downloaded", async () => {
    const ticket = await newTicket();
    const [note] = await db
      .insert(supportMessage)
      .values({ ticketId: ticket.id, kind: "note", body: "private" })
      .returning();
    const [attachment] = await db
      .insert(supportAttachment)
      .values({
        ticketId: ticket.id,
        messageId: note?.id,
        filename: "secret.txt",
        contentType: "text/plain",
        size: 1,
        state: "stored",
        storeKey: supportFileKey(),
      })
      .returning();
    expect(await getCustomerAttachment(ownerScope(), attachment?.id ?? "")).toBeNull();
  });

  test("unread follows the last reply", async () => {
    const ticket = await newTicket();
    const scope = ownerScope();
    const before = await countUnreadCustomerTickets(scope);
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Hi" });
    expect(await countUnreadCustomerTickets(scope)).toBe(before + 1);
    await markCustomerTicketRead(scope, ticket.id, new Date(Date.now() + 1000));
    expect(await countUnreadCustomerTickets(scope)).toBe(before);
  });
});

describe("the clock", () => {
  test("a reply stops it and a customer reply starts it", async () => {
    const ticket = await newTicket();
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "On it" });
    const answered = await ticketById(ticket.id);
    expect(answered.status).toBe("pending");
    expect(answered.responseDueAt).toBeNull();
    expect(answered.awaitingSince).toBeNull();
    expect(answered.firstRespondedAt).not.toBeNull();
    expect(answered.assigneeUserId).toBe(desk.owner.id);
    await replyAsCustomer(
      { scope: ownerScope(), ticketId: ticket.id, author: author(), body: "Still broken" },
      { planFor: plans() },
    );
    const again = await ticketById(ticket.id);
    expect(again.status).toBe("open");
    expect(again.responseDueAt).not.toBeNull();
  });

  test("a second customer message keeps the earlier deadline", async () => {
    const ticket = await newTicket();
    const due = ticket.responseDueAt;
    await replyAsCustomer(
      { scope: ownerScope(), ticketId: ticket.id, author: author(), body: "More detail" },
      { planFor: plans() },
    );
    expect((await ticketById(ticket.id)).responseDueAt?.getTime()).toBe(due?.getTime());
  });

  test("a late reply records the miss", async () => {
    const created = new Date("2026-11-03T16:00:00Z");
    const ticket = await newTicket({ now: created });
    await replyAsAgent({
      ticketId: ticket.id,
      author: rep(desk),
      body: "Sorry for the wait",
      now: new Date("2026-11-10T16:00:00Z"),
    });
    expect((await ticketById(ticket.id)).breachedAt?.getTime()).toBe(
      ticket.responseDueAt?.getTime(),
    );
  });

  test("a change of severity recalculates from when the customer started waiting", async () => {
    const created = new Date("2026-11-03T16:00:00Z");
    const ticket = await newTicket({ now: created });
    // Pro: a business day.
    expect(ticket.responseDueAt?.toISOString()).toBe("2026-11-04T16:00:00.000Z");
    const urgent = await setSupportSeverity(
      {
        ticketId: ticket.id,
        severity: "urgent",
        author: rep(desk),
        now: new Date("2026-11-03T17:00:00Z"),
      },
      { planFor: plans() },
    );
    // Pro urgent: 4 business hours from when it arrived, not from the change.
    expect(urgent.responseDueAt?.toISOString()).toBe("2026-11-03T20:00:00.000Z");
    expect((await messagesOf(ticket.id)).at(-1)?.event).toBe("severity_changed");
  });

  test("a plan change recalculates on confirmation", async () => {
    const id = await receive(desk, { dmarc: "gray", from: `plan-${Date.now()}@example.test` });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(id);
    expect(ticket.plan).toBe("free");
    const free = ticket.responseDueAt?.getTime() ?? 0;
    const confirmed = await confirmSupportOrganization(
      { ticketId: ticket.id, organizationId: customer.organization.id, author: rep(desk) },
      { planFor: plans() },
    );
    expect(confirmed.plan).toBe("pro");
    expect(confirmed.responseDueAt?.getTime()).toBeLessThan(free);
  });

  test("an all-hours contract ignores support hours", async () => {
    const saturday = new Date("2026-11-07T18:00:00Z");
    const ticket = await createDashboardTicket(
      {
        organizationId: customer.organization.id,
        organizationName: customer.organization.name,
        author: author(),
        subject: "Weekend outage",
        category: "technical",
        severity: "urgent",
        body: "Down",
        now: saturday,
      },
      {
        planFor: fixedSupportPlans({
          [customer.organization.id]: { plan: "enterprise", allHours: true },
        }),
      },
    );
    expect(ticket.responseDueAt?.toISOString()).toBe("2026-11-07T19:00:00.000Z");
    expect(ticket.allHours).toBe(true);
  });
});

describe("rep actions", () => {
  test("a reply waits if the customer wrote meanwhile", async () => {
    const ticket = await newTicket();
    const [seen] = await messagesOf(ticket.id);
    await replyAsCustomer(
      { scope: ownerScope(), ticketId: ticket.id, author: author(), body: "One more thing" },
      { planFor: plans() },
    );
    await expect(
      replyAsAgent({
        ticketId: ticket.id,
        author: rep(desk),
        body: "Answer",
        lastSeenMessageId: seen?.id,
      }),
    ).rejects.toThrow("wrote again");
  });

  test("a spam ticket must come out of Spam before a reply", async () => {
    const ticket = await newTicket();
    await markSupportSpam({ ticketId: ticket.id, author: rep(desk) });
    await expect(
      replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Hi" }),
    ).rejects.toThrow("not spam");
    const back = await markSupportNotSpam(
      { ticketId: ticket.id, author: rep(desk) },
      { planFor: plans() },
    );
    expect(back.status).toBe("open");
    expect(back.responseDueAt).not.toBeNull();
  });

  test("resolving and reopening are visible events; reopening starts no clock by itself", async () => {
    const ticket = await newTicket();
    await setSupportStatus({
      ticketId: ticket.id,
      change: { status: "resolved" },
      author: rep(desk),
    });
    expect((await ticketById(ticket.id)).responseDueAt).toBeNull();
    await reopenAsCustomer({ scope: ownerScope(), ticketId: ticket.id }, { planFor: plans() });
    const reopened = await ticketById(ticket.id);
    expect(reopened.status).toBe("open");
    expect(reopened.responseDueAt).not.toBeNull();
    const read = await getCustomerTicket(ownerScope(), ticket.id);
    expect(read?.messages.map((m) => m.event)).toContain("reopened");
    expect(read?.messages.map((m) => m.event)).toContain("resolved");
  });

  test("customers can resolve their own", async () => {
    const ticket = await newTicket();
    await resolveAsCustomer({ scope: ownerScope(), ticketId: ticket.id, author: author() });
    const resolved = await ticketById(ticket.id);
    expect(resolved.status).toBe("resolved");
    expect(resolved.responseDueAt).toBeNull();
  });

  test("a suggested Cc joins only when accepted", async () => {
    const id = await receive(desk, { dmarc: "gray", cc: ["maybe@example.test"] });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(id);
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Not yet" });
    const before = await deliver([ticket.id]);
    expect(before.sent.flatMap((email) => email.cc)).toEqual([]);
    const accepted = await acceptSuggestedCc({
      ticketId: ticket.id,
      address: "maybe@example.test",
      author: rep(desk),
    });
    expect(accepted.cc).toEqual(["maybe@example.test"]);
    expect(accepted.suggestedCc).toEqual([]);
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Now" });
    const after = await deliver([ticket.id]);
    expect(after.sent.at(-1)?.cc).toEqual(["maybe@example.test"]);
  });

  test("an address that wasn't suggested can't be accepted", async () => {
    const ticket = await newTicket();
    const after = await acceptSuggestedCc({
      ticketId: ticket.id,
      address: "other@evil.test",
      author: rep(desk),
    });
    expect(after.cc).toEqual([]);
  });
});

describe("queue", () => {
  test("orders by next due, with the plan breaking ties", async () => {
    const tenant = await createTestTenant();
    const at = new Date("2026-11-03T16:00:00Z");
    const make = (plan: "pro" | "scale", severity: "normal" | "urgent", subject: string) =>
      createDashboardTicket(
        {
          organizationId: tenant.organization.id,
          organizationName: tenant.organization.name,
          author: author(tenant),
          subject,
          category: "technical",
          severity,
          body: "x",
          now: at,
        },
        { planFor: fixedSupportPlans({ [tenant.organization.id]: plan }) },
      );
    const slow = await make("pro", "normal", "Pro normal");
    const fast = await make("scale", "urgent", "Scale urgent");
    const mid = await make("scale", "normal", "Scale normal");
    const tiedPro = await make("pro", "urgent", "Pro urgent");
    const queue = await listSupportQueue({
      view: "needs_reply",
      actorUserId: desk.owner.id,
      scope: { ticketIds: [slow.id, fast.id, mid.id, tiedPro.id] },
    });
    // Scale normal and Pro urgent are both due in 4 business hours: Scale first.
    expect(queue.map((item) => item.subject)).toEqual([
      "Scale urgent",
      "Scale normal",
      "Pro urgent",
      "Pro normal",
    ]);
  });

  test("views and search", async () => {
    const ticket = await newTicket({ subject: "Unmistakable zebra subject" });
    const scope = { ticketIds: [ticket.id] };
    const view = (name: Parameters<typeof listSupportQueue>[0]["view"]) =>
      listSupportQueue({ view: name, actorUserId: desk.owner.id, scope }).then(
        (rows) => rows.length,
      );
    expect(await view("needs_reply")).toBe(1);
    expect(await view("unassigned")).toBe(1);
    expect(await view("mine")).toBe(0);
    await assignSupportTicket({
      ticketId: ticket.id,
      assigneeUserId: desk.owner.id,
      author: rep(desk),
    });
    expect(await view("mine")).toBe(1);
    expect(await view("unassigned")).toBe(0);
    const found = await listSupportQueue({
      view: "needs_reply",
      actorUserId: desk.owner.id,
      search: "zebra",
      scope,
    });
    expect(found).toHaveLength(1);
    const byNumber = await listSupportQueue({
      view: "needs_reply",
      actorUserId: desk.owner.id,
      search: `#${ticket.number}`,
      scope,
    });
    expect(byNumber).toHaveLength(1);
  });
});

describe("email", () => {
  test("an acknowledgement states the target and links the ticket", async () => {
    const ticket = await newTicket();
    const mailer = await deliver([ticket.id]);
    const [email] = mailer.sent;
    expect(email?.to).toEqual([ticket.requesterEmail]);
    expect(email?.fromName).toBe("coss.com Support");
    expect(email?.replyTo).toBe(`support+${ticket.replyToken}@${REPLY_DOMAIN}`);
    expect(email?.subject).toBe(`Re: ${ticket.subject} [#${ticket.number}]`);
    expect(email?.text).toContain("1 business day");
    expect(email?.text).toContain(`/${customer.organization.slug}/support/${ticket.id}`);
  });

  test("a reply comes from the rep and threads under the customer's message", async () => {
    const messageId = `<email-thread-${Date.now()}@example.test>`;
    const id = await receive(desk, { from: customer.owner.email, messageId });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(id);
    await replyAsAgent({
      ticketId: ticket.id,
      author: rep(desk),
      body: "Try this:\n\n```\nbun install\n```",
    });
    const mailer = await deliver([ticket.id]);
    const reply = mailer.sent.at(-1);
    expect(reply?.fromName).toBe("Bailey from coss.com");
    expect(reply?.inReplyTo).toBe(messageId);
    expect(reply?.references).toEqual([messageId]);
    expect(reply?.html).toContain("bun install");
  });

  test("with no organization there's no dashboard link", async () => {
    const id = await receive(desk, { from: `nolink-${Date.now()}@example.test` });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    const ticket = await ticketFrom(id);
    const mailer = await deliver([ticket.id]);
    expect(mailer.sent[0]?.text).not.toContain("View this ticket");
  });

  test("markup in a reply is escaped", async () => {
    const ticket = await newTicket();
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "<img src=x onerror=y>" });
    const mailer = await deliver([ticket.id]);
    expect(mailer.sent.at(-1)?.html).not.toContain("<img src=x");
  });

  test("a colleague's reply reaches the requester", async () => {
    const colleague = await createTestUser();
    await addMember({
      organizationId: customer.organization.id,
      userId: colleague.id,
      role: "admin",
    });
    const ticket = await newTicket();
    await deliver([ticket.id]);
    await replyAsCustomer(
      {
        scope: { organizationId: customer.organization.id, userId: colleague.id, role: "admin" },
        ticketId: ticket.id,
        author: { userId: colleague.id, name: "Grace", email: colleague.email },
        body: "Adding context",
      },
      { planFor: plans() },
    );
    const mailer = await deliver([ticket.id]);
    expect(mailer.sent.map((email) => email.to)).toEqual([[ticket.requesterEmail]]);
    expect(mailer.sent[0]?.text).toContain("Grace");
  });

  test("the requester's own dashboard reply sends them nothing", async () => {
    const ticket = await newTicket();
    await deliver([ticket.id]);
    await replyAsCustomer(
      { scope: ownerScope(), ticketId: ticket.id, author: author(), body: "More" },
      { planFor: plans() },
    );
    expect((await deliver([ticket.id])).sent).toHaveLength(0);
  });

  test("delivery state follows the email", async () => {
    const ticket = await newTicket();
    const mailer = await deliver([ticket.id]);
    const [ack] = (await messagesOf(ticket.id)).filter((m) => m.event === "acknowledged");
    expect(ack?.deliveryStatus).toBe("accepted");
    expect(ack?.emailId).toBe("email_1");
    mailer.statuses.set("email_1", { state: "queued", messageId: null });
    await syncSupportDeliveries({ scope: { ticketIds: [ticket.id] } }, { mailer });
    mailer.statuses.set("email_1", { state: "sent", messageId: "<ses-1@amazonses.com>" });
    await syncSupportDeliveries({ scope: { ticketIds: [ticket.id] } }, { mailer });
    const [sent] = (await messagesOf(ticket.id)).filter((m) => m.event === "acknowledged");
    expect(sent?.rfcMessageId).toBe("<ses-1@amazonses.com>");
    expect(sent?.deliveryStatus).toBe("accepted");
    mailer.statuses.set("email_1", {
      state: "bounced",
      messageId: "<ses-1@amazonses.com>",
      detail: "Address doesn't exist",
    });
    await syncSupportDeliveries({ scope: { ticketIds: [ticket.id] } }, { mailer });
    const [bounced] = (await messagesOf(ticket.id)).filter((m) => m.event === "acknowledged");
    expect(bounced?.deliveryStatus).toBe("bounced");
    expect(bounced?.deliveryError).toBe("Address doesn't exist");
    expect(bounced?.repAlertPending).toBe(true);
  });

  test("a customer's reply threads on the outbound Message-ID", async () => {
    const ticket = await newTicket();
    const mailer = await deliver([ticket.id]);
    const outbound = `<outbound-${ticket.id}@amazonses.com>`;
    mailer.statuses.set("email_1", { state: "sent", messageId: outbound });
    await syncSupportDeliveries({ scope: { ticketIds: [ticket.id] } }, { mailer });
    const id = await receive(desk, { from: ticket.requesterEmail, inReplyTo: outbound });
    await ingestSupportEmails({ limit: 50 }, intakeDeps(desk.production.id, plans()));
    expect((await ticketFrom(id)).id).toBe(ticket.id);
  });

  test("retries back off, then give up and tell the rep", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const ticket = await newTicket();
    const mailer = recordingSupportMailer({ fail: () => new Error("SES is down") });
    let now = new Date();
    for (let attempt = 0; attempt < 8; attempt++) {
      await deliver([ticket.id], mailer, now);
      now = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }
    const [ack] = (await messagesOf(ticket.id)).filter((m) => m.event === "acknowledged");
    expect(ack?.deliveryStatus).toBe("failed");
    expect(ack?.deliveryError).toBe("SES is down");
    expect(ack?.repAlertPending).toBe(true);
    quiet.mockRestore();
  });

  test("a refused send fails at once", async () => {
    const ticket = await newTicket();
    const mailer = recordingSupportMailer({
      fail: () => new PermanentSupportSendError("Invalid address"),
    });
    await deliver([ticket.id], mailer);
    const [ack] = (await messagesOf(ticket.id)).filter((m) => m.event === "acknowledged");
    expect(ack?.deliveryStatus).toBe("failed");
    expect(ack?.deliveryAttempts).toBe(1);
  });

  test("attachments go out with the reply", async () => {
    const ticket = await newTicket();
    const key = supportFileKey();
    await store.put({ key, contentType: "text/plain", content: new TextEncoder().encode("hi") });
    const [upload] = await db
      .insert(supportAttachment)
      .values({
        uploadedByUserId: desk.owner.id,
        filename: "notes.txt",
        contentType: "text/plain",
        size: 2,
        state: "stored",
        storeKey: key,
      })
      .returning();
    await replyAsAgent({
      ticketId: ticket.id,
      author: rep(desk),
      body: "Attached",
      attachmentIds: [upload?.id ?? ""],
    });
    const mailer = await deliver([ticket.id]);
    expect(mailer.sent.at(-1)?.attachments.map((a) => a.filename)).toEqual(["notes.txt"]);
  });

  test("a retried send keeps its identity though the thread grew", async () => {
    const ticket = await newTicket();
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Answer" });
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const attempts: { key: string; hash: string; references: string[] }[] = [];
    const watching = recordingSupportMailer({
      fail: (email) => {
        if (email.idempotencyKey.startsWith("support:")) {
          attempts.push({
            key: email.idempotencyKey,
            hash: email.requestHash,
            references: email.references,
          });
        }
        return new Error("flaky");
      },
    });
    let now = new Date();
    await deliver([ticket.id], watching, now);
    await db
      .update(supportMessage)
      .set({ rfcMessageId: `<grew-${ticket.id}@example.test>` })
      .where(and(eq(supportMessage.ticketId, ticket.id), eq(supportMessage.kind, "customer")));
    now = new Date(now.getTime() + 60 * 60 * 1000);
    await deliver([ticket.id], watching, now);
    quiet.mockRestore();
    const agent = (await messagesOf(ticket.id)).find((message) => message.kind === "agent");
    const retries = attempts.filter((attempt) => attempt.key === `support:${agent?.id}`);
    expect(retries).toHaveLength(2);
    expect(retries[1]?.hash).toBe(retries[0]?.hash as string);
    expect(retries[1]?.references).not.toEqual(retries[0]?.references as string[]);
  });

  test("subject helper doesn't stack Re:", () => {
    expect(supportSubject({ subject: "Re: Hello", number: 1 })).toBe("Re: Hello [#1]");
  });
});

describe("housekeeping", () => {
  test("received attachments are copied once", async () => {
    const ticket = await newTicket();
    const key = supportFileKey();
    const bytes = new TextEncoder().encode("attachment");
    const [row] = await db
      .insert(supportAttachment)
      .values({
        ticketId: ticket.id,
        filename: "a.txt",
        contentType: "text/plain",
        size: bytes.length,
        state: "pending_copy",
        sourceKey: "inbound/key",
        storeKey: key,
        nextAttemptAt: new Date(0),
      })
      .returning();
    const inbound = { get: async (k: string) => (k === "inbound/key" ? bytes : null) };
    await copySupportAttachments({ scope: { ticketIds: [ticket.id] } }, { inbound, store });
    const [copied] = await db
      .select()
      .from(supportAttachment)
      .where(eq(supportAttachment.id, row?.id ?? ""));
    expect(copied?.state).toBe("stored");
    expect(copied?.sourceKey).toBeNull();
    expect(new TextDecoder().decode((await store.get(key)) ?? undefined)).toBe("attachment");
  });

  test("a received attachment already expired is marked failed", async () => {
    const ticket = await newTicket();
    const [row] = await db
      .insert(supportAttachment)
      .values({
        ticketId: ticket.id,
        filename: "a.txt",
        contentType: "text/plain",
        size: 1,
        state: "pending_copy",
        sourceKey: "gone",
        storeKey: supportFileKey(),
        nextAttemptAt: new Date(0),
      })
      .returning();
    await copySupportAttachments(
      { scope: { ticketIds: [ticket.id] } },
      { inbound: { get: async () => null }, store },
    );
    const [copied] = await db
      .select()
      .from(supportAttachment)
      .where(eq(supportAttachment.id, row?.id ?? ""));
    expect(copied?.state).toBe("failed");
  });

  test("snoozes wake", async () => {
    const ticket = await newTicket();
    const until = new Date(Date.now() + 60_000);
    await setSupportStatus({
      ticketId: ticket.id,
      change: { status: "snoozed", snoozedUntil: until },
      author: rep(desk),
    });
    await wakeSnoozedTickets({ scope: { ticketIds: [ticket.id] } });
    expect((await ticketById(ticket.id)).status).toBe("snoozed");
    await wakeSnoozedTickets({
      now: new Date(until.getTime() + 1),
      scope: { ticketIds: [ticket.id] },
    });
    expect((await ticketById(ticket.id)).status).toBe("open");
  });

  test("quiet tickets close with a closing email", async () => {
    const ticket = await newTicket();
    await deliver([ticket.id]);
    await replyAsAgent({ ticketId: ticket.id, author: rep(desk), body: "Does this help?" });
    await deliver([ticket.id]);
    const scope = { ticketIds: [ticket.id] };
    await autoResolveQuietTickets({ scope });
    expect((await ticketById(ticket.id)).status).toBe("pending");
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await autoResolveQuietTickets({ scope, now: later });
    const closed = await ticketById(ticket.id);
    expect(closed.status).toBe("resolved");
    const mailer = await deliver([ticket.id], recordingSupportMailer(), later);
    expect(mailer.sent.at(-1)?.text).toContain("closed this ticket");
  });

  test("alerts go out once, and stale ones skip themselves", async () => {
    const tenant = await createTestTenant();
    const ticket = await newTicket();
    const scope = { ticketIds: [ticket.id] };
    await enqueueSupportAlerts({ organizationId: tenant.organization.id, scope });
    await enqueueSupportAlerts({ organizationId: tenant.organization.id, scope });
    const rows = await db
      .select()
      .from(notification)
      .where(eq(notification.organizationId, tenant.organization.id));
    expect(rows.map((row) => row.kind)).toEqual([SUPPORT_ALERT_KINDS.newTicket]);

    const created = new Date("2026-11-03T16:00:00Z");
    const late = await newTicket({ now: created });
    await enqueueSupportAlerts({
      organizationId: tenant.organization.id,
      scope: { ticketIds: [late.id] },
      now: new Date("2026-11-04T15:30:00Z"),
    });
    await enqueueSupportAlerts({
      organizationId: tenant.organization.id,
      scope: { ticketIds: [late.id] },
      now: new Date("2026-11-04T17:00:00Z"),
    });
    const kinds = (
      await db
        .select({ kind: notification.kind })
        .from(notification)
        .where(eq(notification.organizationId, tenant.organization.id))
    ).map((row) => row.kind);
    expect(kinds).toContain(SUPPORT_ALERT_KINDS.atRisk);
    expect(kinds).toContain(SUPPORT_ALERT_KINDS.breached);

    const kind = SUPPORT_NOTIFICATION_KINDS[SUPPORT_ALERT_KINDS.breached];
    const context = {
      organizationId: tenant.organization.id,
      organization: { name: "coss.com", slug: "coss" },
      payload: { ticketId: late.id, dueAt: late.responseDueAt?.toISOString() },
      createdAt: new Date(),
      now: new Date(),
      url: (path: string) => `https://coss.test${path}`,
    };
    const fresh = await kind?.render(context);
    expect(fresh && "subject" in fresh ? fresh.subject : "").toContain("SLA missed");
    await replyAsAgent({ ticketId: late.id, author: rep(desk), body: "Answered" });
    const stale = await kind?.render(context);
    expect(stale && "skip" in stale).toBe(true);
  });

  test("alerts go to the assignee, else every rep", async () => {
    const assignee = await createTestUser();
    const ticket = await newTicket();
    await db.update(user).set({ role: "admin" }).where(eq(user.id, assignee.id));
    const kind = SUPPORT_NOTIFICATION_KINDS[SUPPORT_ALERT_KINDS.newTicket];
    const context = {
      organizationId: desk.organization.id,
      organization: { name: "coss.com", slug: "coss" },
      payload: { ticketId: ticket.id },
      createdAt: new Date(),
      now: new Date(),
      url: (path: string) => `https://coss.test${path}`,
    };
    const everyone = await kind?.recipients?.(context);
    expect(everyone?.map((r) => r.userId)).toContain(assignee.id);
    await assignSupportTicket({
      ticketId: ticket.id,
      assigneeUserId: assignee.id,
      author: rep(desk),
    });
    const one = await kind?.recipients?.(context);
    expect(one?.map((r) => r.userId)).toEqual([assignee.id]);
    await db.update(user).set({ role: null }).where(eq(user.id, assignee.id));
  });
});

describe("retention and deletion", () => {
  const DAY = 24 * 60 * 60 * 1000;

  test("resolved tickets go after two years, with their files", async () => {
    const ticket = await newTicket();
    const key = supportFileKey();
    await store.put({ key, contentType: "text/plain", content: new Uint8Array([1]) });
    await db.insert(supportAttachment).values({
      ticketId: ticket.id,
      filename: "a",
      contentType: "text/plain",
      size: 1,
      state: "stored",
      storeKey: key,
    });
    const resolvedAt = new Date();
    await db
      .update(supportTicket)
      .set({ status: "resolved", resolvedAt })
      .where(eq(supportTicket.id, ticket.id));
    const scope = { ticketIds: [ticket.id] };
    expect(await purgeExpiredSupportTickets({ store, scope })).toBe(0);
    const later = new Date(resolvedAt.getTime() + 731 * DAY);
    expect(await purgeExpiredSupportTickets({ store, scope, now: later })).toBe(1);
    expect(await store.get(key)).toBeNull();
    expect(await db.select().from(supportTicket).where(eq(supportTicket.id, ticket.id))).toEqual(
      [],
    );
  });

  test("open tickets are never purged", async () => {
    const ticket = await newTicket();
    const later = new Date(Date.now() + 5000 * DAY);
    expect(
      await purgeExpiredSupportTickets({ store, scope: { ticketIds: [ticket.id] }, now: later }),
    ).toBe(0);
  });

  test("spam goes after 30 days", async () => {
    const ticket = await newTicket();
    await markSupportSpam({ ticketId: ticket.id, author: rep(desk) });
    const scope = { ticketIds: [ticket.id] };
    expect(
      await purgeExpiredSupportTickets({ store, scope, now: new Date(Date.now() + 29 * DAY) }),
    ).toBe(0);
    expect(
      await purgeExpiredSupportTickets({ store, scope, now: new Date(Date.now() + 31 * DAY) }),
    ).toBe(1);
  });

  test("without a store, tickets with files wait", async () => {
    const ticket = await newTicket();
    await db.insert(supportAttachment).values({
      ticketId: ticket.id,
      filename: "a",
      contentType: "text/plain",
      size: 1,
      state: "stored",
      storeKey: supportFileKey(),
    });
    await db
      .update(supportTicket)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(supportTicket.id, ticket.id));
    expect(
      await purgeExpiredSupportTickets({
        store: null,
        scope: { ticketIds: [ticket.id] },
        now: new Date(Date.now() + 731 * DAY),
      }),
    ).toBe(0);
  });

  test("uploads never sent are removed", async () => {
    const uploader = await createTestUser();
    const key = supportFileKey();
    await store.put({ key, contentType: "text/plain", content: new Uint8Array([1]) });
    await db.insert(supportAttachment).values({
      uploadedByUserId: uploader.id,
      filename: "a",
      contentType: "text/plain",
      size: 1,
      state: "stored",
      storeKey: key,
    });
    const scope = { uploaderIds: [uploader.id] };
    expect(await purgeSupportLeftovers({ store, scope })).toBe(0);
    expect(await purgeSupportLeftovers({ store, scope, now: new Date(Date.now() + 2 * DAY) })).toBe(
      1,
    );
    expect(await store.get(key)).toBeNull();
  });

  test("deleting a user keeps the ticket", async () => {
    const leaving = await createTestUser();
    await addMember({
      organizationId: customer.organization.id,
      userId: leaving.id,
      role: "member",
    });
    const ticket = await newTicket({
      author: { userId: leaving.id, name: "Leaving", email: leaving.email },
    });
    await assignSupportTicket({
      ticketId: ticket.id,
      assigneeUserId: leaving.id,
      author: { userId: leaving.id, name: "Leaving", email: leaving.email },
    });
    const result = await deleteUserAccount({ userId: leaving.id, email: leaving.email });
    expect(result).toBeDefined();
    const after = await ticketById(ticket.id);
    expect(after.requesterUserId).toBeNull();
    expect(after.assigneeUserId).toBeNull();
    expect(after.requesterEmail).toBe(leaving.email);
  });

  test("deleting an organization keeps the ticket and its name", async () => {
    const leaving = await createTestTenant();
    const ticket = await createDashboardTicket(
      {
        organizationId: leaving.organization.id,
        organizationName: leaving.organization.name,
        author: author(leaving),
        subject: "Closing down",
        category: "account",
        severity: "normal",
        body: "Bye",
      },
      { planFor: fixedSupportPlans() },
    );
    await db.delete(schema.organization).where(eq(schema.organization.id, leaving.organization.id));
    const after = await ticketById(ticket.id);
    expect(after.organizationId).toBeNull();
    expect(after.organizationName).toBe(leaving.organization.name);
  });
});
