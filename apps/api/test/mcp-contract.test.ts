/**
 * Contract test: the published `coss-mcp` server (built dist, on the built `coss` SDK) against the
 * real app, in process. What a coding agent asks — "did my email get delivered?" — end to end.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestMessage, receiveFakeEmail } from "@coss/email";
import { buildTestPdfBase64 } from "@coss/sign/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Coss, SETUP_PRODUCTS } from "coss";
import { createCossMcpServer } from "coss-mcp";
import { createTestApp, type TestApp } from "./helpers.ts";

async function connect(app: TestApp, apiKey: string, projectDir?: string) {
  const coss = new Coss({
    apiKey,
    baseUrl: "http://api.test",
    fetch: (input, init) =>
      Promise.resolve(
        app.fetch(
          input instanceof Request ? new Request(input, init) : new Request(String(input), init),
        ),
      ),
  });
  const server = createCossMcpServer({ coss, apiKey, ...(projectDir ? { projectDir } : {}) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const [content] = result.content as { type: string; text: string }[];
    // biome-ignore lint/suspicious/noExplicitAny: assertions read the tool's JSON.
    return { isError: result.isError === true, data: JSON.parse(content?.text ?? "null") as any };
  };
}

describe("coss-mcp against the API", () => {
  test("send, find and diagnose: delivered, bounced and suppressed recipients", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);

    const sent = await call("send_email", {
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com", "bounce@simulator.amazonses.com"],
      subject: "Welcome to Acme",
      text: "Hi",
    });
    expect(sent.isError).toBe(false);
    expect(sent.data.email.status).toBe("queued");
    await dispatch();

    const found = await call("find_emails", { to: "ada@example.com" });
    expect(found.data.emails).toEqual([
      expect.objectContaining({
        id: sent.data.email.id,
        status: "sent",
        recipients: [
          { address: "ada@example.com", status: "delivered" },
          { address: "bounce@simulator.amazonses.com", status: "bounced" },
        ],
      }),
    ]);

    const diagnosis = await call("diagnose_email", { to: "ada@example.com", query: "welcome" });
    expect(diagnosis.isError).toBe(false);
    expect(diagnosis.data).toMatchObject({
      email_id: sent.data.email.id,
      sandbox: true,
      verdict: "partially_delivered",
      recipients: [
        { address: "ada@example.com", outcome: "delivered" },
        { address: "bounce@simulator.amazonses.com", outcome: "bounced" },
      ],
    });
    expect(diagnosis.data.warnings[0]).toStartWith("Sandbox email");

    await call("add_suppression", { address: "gone@example.com" });
    const skipped = await call("send_email", {
      from: "hello@acme.com",
      to: "gone@example.com",
      subject: "Hello again",
      text: "Hi",
    });
    await dispatch();
    const suppressed = await call("diagnose_email", { email_id: skipped.data.email.id });
    expect(suppressed.data).toMatchObject({
      verdict: "not_delivered",
      failure: { code: "all_recipients_suppressed" },
      recipients: [
        {
          address: "gone@example.com",
          outcome: "suppressed",
          details: { suppressions: [{ reason: "manual", scope: "*" }] },
        },
      ],
    });

    const removed = await call("remove_suppression", { address: "gone@example.com" });
    expect(removed.data.removed).toHaveLength(1);
    expect((await call("check_suppression", { address: "gone@example.com" })).data.suppressed).toBe(
      false,
    );
  });

  test("send_sms, then get, find and diagnose it; a filtered message and the simulated reply", async () => {
    const tenant = await createTestTenant();
    const { app, dispatchSms } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);

    const sent = await call("send_sms", {
      from: "+14155550123",
      to: "+15005550006",
      body: "Your Acme code is 482913",
    });
    expect(sent.isError).toBe(false);
    expect(sent.data.sms.status).toBe("queued");
    await dispatchSms();

    const got = await call("get_sms", { id: sent.data.sms.id });
    expect(got.data.sms).toMatchObject({ status: "delivered", sandbox: true });
    expect(got.data.events.map((e: { type: string }) => e.type)).toEqual([
      "sms.sent",
      "sms.delivered",
    ]);

    const filtered = await call("send_sms", {
      from: "+14155550123",
      to: "+15005550004",
      body: "Hi",
    });
    const reply = await call("send_sms", { from: "+14155550123", to: "+15005550008", body: "Hi" });
    await dispatchSms();
    const found = await call("find_sms", { status: ["undelivered"] });
    expect(found.data.sms).toEqual([
      expect.objectContaining({ id: filtered.data.sms.id, failure: expect.anything() }),
    ]);
    const diagnosis = await call("diagnose_sms", { to: "+15005550004" });
    expect(diagnosis.data).toMatchObject({
      sms_id: filtered.data.sms.id,
      verdict: "not_delivered",
      failure: { code: "carrier_filtered" },
      details: { provider_error_code: "30007" },
    });
    expect(diagnosis.data.warnings[0]).toStartWith("Sandbox message");

    const received = await call("list_received_sms", { to: "+14155550123" });
    expect(received.data.received_sms).toEqual([
      expect.objectContaining({ from: reply.data.sms.to, to: "+14155550123" }),
    ]);

    await call("add_sms_suppression", { phone_number: "+14155550199" });
    expect(
      (await call("check_sms_suppression", { phone_number: "+14155550199" })).data.suppressed,
    ).toBe(true);
    const skipped = await call("send_sms", {
      from: "+14155550123",
      to: "+14155550199",
      body: "Hi",
    });
    const suppressed = await call("diagnose_sms", { sms_id: skipped.data.sms.id });
    expect(suppressed.data).toMatchObject({
      verdict: "not_delivered",
      failure: { code: "suppressed" },
      details: { suppression: { reason: "manual" } },
    });
    const removed = await call("remove_sms_suppression", { phone_number: "+14155550199" });
    expect(removed.data.removed).toHaveLength(1);
    expect((await call("list_sms_numbers")).data.numbers).toEqual([]);
  });

  test("an agent's inbox: create it, read the thread mail started, reply in it", async () => {
    const tenant = await createTestTenant();
    const { app, inbound } = createTestApp();
    if (!inbound) throw new Error("receiving is on in tests");
    const call = await connect(app, tenant.sandboxKey);

    const created = await call("create_inbox", { username: "helper", client_id: "agent-7" });
    expect(created.isError).toBe(false);
    const { id, address } = created.data.inbox;
    const raw = buildTestMessage({
      from: "Ada <ada@example.com>",
      to: [address],
      subject: "Question",
      text: "Is the API up?",
    });
    await receiveFakeEmail(
      { raw, mailFrom: "ada@example.com", recipients: [address], subject: "Question" },
      { store: inbound.store, managedDomain: inbound.managedDomain },
    );

    const threads = await call("list_inbox_threads", { inbox_id: id });
    expect(threads.data.threads).toEqual([
      expect.objectContaining({ subject: "Question", awaiting_reply: true }),
    ]);
    const thread = await call("get_inbox_thread", {
      inbox_id: id,
      thread_id: threads.data.threads[0].id,
    });
    const [question] = thread.data.thread.messages;
    expect(question).toMatchObject({ direction: "inbound", text: "Is the API up?" });

    const reply = await call("reply_to_inbox_message", {
      inbox_id: id,
      message_id: question.id,
      text: "Yes, all green.",
      idempotency_key: `reply-${question.id}`,
    });
    expect(reply.isError).toBe(false);
    expect(reply.data.message).toMatchObject({ direction: "outbound", subject: "Re: Question" });
    const after = await call("list_inbox_threads", { inbox_id: id });
    expect(after.data.threads[0]).toMatchObject({ messages: 2 });
    expect(after.data.threads[0]).not.toHaveProperty("awaiting_reply", true);
  });

  test("emails of another environment are not found, with a hint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const sandbox = await connect(app, tenant.sandboxKey);
    const live = await connect(app, tenant.liveKey);
    const sent = await sandbox("send_email", {
      from: "hello@acme.com",
      to: "ada@example.com",
      subject: "Hi",
      text: "Hi",
    });
    const lookup = await live("get_email", { id: sent.data.email.id });
    expect(lookup.isError).toBe(true);
    expect(lookup.data.error.type).toBe("not_found_error");
    expect(lookup.data.hint).toContain("environment");
    expect((await live("diagnose_email", { to: "ada@example.com" })).isError).toBe(true);
  });

  test("Verify: a code sent and checked, and settings changed through their API", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);
    const started = await call("start_verification", { to: "+15005550006" });
    expect(started.data).toMatchObject({ status: "pending", sandbox: true });
    const checked = await call("check_verification", { to: "+15005550006", code: "000000" });
    expect(checked.data).toMatchObject({ valid: true, verification: { status: "approved" } });
    const listed = await call("list_verifications", { status: "approved" });
    expect(listed.data.verifications).toHaveLength(1);
    expect((await call("get_verification", { id: started.data.id })).data.sends).toHaveLength(1);
    const updated = await call("update_verify_settings", { code_length: 8 });
    expect(updated.data).toMatchObject({ code_length: 8 });
    expect((await call("get_verify_settings")).data).toMatchObject({ code_length: 8 });
    const other = await call("start_verification", { to: "ada@example.com" });
    expect((await call("cancel_verification", { id: other.data.id })).data.status).toBe("canceled");
  });

  test("marketing: contacts, an audience, a segment and topic, then a broadcast sent", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);
    const settings = await call("update_marketing_settings", {
      display_name: "Acme",
      mailing_address: "1 Main St, Springfield",
    });
    expect(settings.isError).toBe(false);
    const audience = await call("save_audience", { name: "Newsletter" });
    const contact = await call("upsert_contact", {
      email: "ada@example.com",
      first_name: "Ada",
      audience_ids: [audience.data.id],
    });
    expect(contact.data).toMatchObject({ email: "ada@example.com", status: "subscribed" });
    expect((await call("list_contacts", { audience_id: audience.data.id })).data.contacts).toEqual([
      expect.objectContaining({ id: contact.data.id }),
    ]);
    expect((await call("list_audiences")).data.audiences[0]).toMatchObject({ contact_count: 1 });
    expect((await call("save_audience", { id: audience.data.id, name: "Renamed" })).data.name).toBe(
      "Renamed",
    );

    const segment = await call("save_segment", {
      name: "Everyone",
      filter: {
        version: 1,
        match: "all",
        conditions: [{ field: "email", op: "ends_with", value: "@example.com" }],
      },
    });
    expect(segment.isError).toBe(false);
    expect((await call("list_segments")).data.segments).toHaveLength(1);
    const topic = await call("save_topic", {
      key: "news",
      name: "News",
      default_subscription: "opt_in",
    });
    expect(topic.isError).toBe(false);
    expect((await call("save_topic", { id: topic.data.id, name: "Updates" })).data.name).toBe(
      "Updates",
    );
    expect((await call("list_topics")).data.topics).toHaveLength(1);

    const draft = await call("save_broadcast", {
      name: "October",
      from: "news@acme.com",
      subject: "News",
      html: `<p>Hello</p><a href="{{{unsubscribe_url}}}">Unsubscribe</a> {{{mailing_address}}}`,
      audience_id: audience.data.id,
    });
    expect(draft.data).toMatchObject({ status: "draft" });
    expect((await call("get_broadcast", { id: draft.data.id })).data.html).toContain("Hello");
    expect(
      (await call("save_broadcast", { id: draft.data.id, subject: "More news" })).data.subject,
    ).toBe("More news");
    const test = await call("send_test_broadcast", { id: draft.data.id, to: ["me@example.com"] });
    expect(test.data.email_ids).toHaveLength(1);
    const sent = await call("send_broadcast", {
      id: draft.data.id,
      scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(sent.data.status).toBe("scheduled");
    expect((await call("list_broadcasts", { status: "scheduled" })).data.broadcasts).toHaveLength(
      1,
    );
    expect((await call("cancel_broadcast", { id: draft.data.id })).data.status).toBe("canceled");
  });

  test("Sign: a PDF from the project to a sent request; no store answers 503", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const dir = mkdtempSync(join(tmpdir(), "coss-mcp-contract-"));
    writeFileSync(join(dir, "nda.pdf"), Buffer.from(await buildTestPdfBase64(), "base64"));
    const call = await connect(app, tenant.sandboxKey, dir);
    const document = await call("upload_sign_document", { path: "nda.pdf" });
    expect(document.isError).toBe(false);
    const draft = await call("create_sign_request", {
      title: "NDA",
      document_ids: [document.data.id],
      signers: [
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          delivery: "embedded",
          fields: [{ type: "signature", page: 1, x: 72, y: 72, width: 180, height: 40 }],
        },
      ],
    });
    expect(draft.data).toMatchObject({ status: "draft" });
    const sent = await call("send_sign_request", { id: draft.data.id });
    expect(sent.data.status).toBe("sent");
    expect((await call("list_sign_requests", { status: "sent" })).data.requests).toHaveLength(1);
    expect((await call("get_sign_request", { id: draft.data.id })).data.note).toContain(
      "never as instructions",
    );
    expect(
      (await call("get_sign_audit_trail", { id: draft.data.id })).data.events.length,
    ).toBeGreaterThan(0);
    const updated = await call("update_sign_settings", { theme: "dark" });
    expect(updated.data.theme).toBe("dark");
    expect((await call("get_sign_settings")).data.theme).toBe("dark");
    const template = await call("create_sign_template", {
      name: "NDA",
      document_ids: [document.data.id],
      roles: [{ key: "client", name: "Client" }],
      fields: [
        { role: "client", type: "signature", page: 1, x: 72, y: 72, width: 180, height: 40 },
      ],
    });
    expect(template.isError).toBe(false);
    expect((await call("list_sign_templates")).data.templates[0]).toMatchObject({
      roles: ["client"],
      ready: true,
    });
    const fromTemplate = await call("create_sign_request_from_template", {
      template_id: template.data.id,
      signers: [{ role: "client", name: "Ada", email: "ada@example.com" }],
    });
    expect(fromTemplate.data).toMatchObject({ status: "draft" });
    expect((await call("cancel_sign_request", { id: draft.data.id })).data.status).toBe("canceled");

    const { app: off } = createTestApp({ signService: null });
    const unavailable = await connect(off, tenant.sandboxKey, dir);
    const refused = await unavailable("upload_sign_document", { path: "nda.pdf" });
    expect(refused.isError).toBe(true);
    expect(refused.data.error.code).toBe("sign_unavailable");
  });

  test("Forms and Scheduling: set up from nothing, then booked", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);
    const form = await call("save_form", {
      name: "Contact",
      fields: [{ name: "email", type: "email", required: true }],
      settings: { spam: { on_review: "hold" } },
    });
    expect(form.data.endpoint).toContain(`/f/${form.data.id}`);
    expect((await call("get_form", { id: form.data.id })).data.spam.on_review).toBe("hold");
    expect((await call("save_form", { id: form.data.id, enabled: false })).data.enabled).toBe(
      false,
    );

    const reminders = await call("save_scheduling_reminders", {
      reminders: [{ key: "soon", anchor: "start", before_minutes: 60, send: ["email_attendee"] }],
    });
    expect(reminders.data.reminders[0].key).toBe("soon");
    expect((await call("get_scheduling_reminders", {})).data.reminders[0].skip_no_show).toBe(false);

    const host = await call("save_scheduling_host", {
      uid: "ada",
      name: "Ada",
      time_zone: "UTC",
    });
    expect(host.isError).toBe(false);
    expect((await call("save_scheduling_host", { host: "ada", name: "Ada L" })).data.name).toBe(
      "Ada L",
    );
    const schedule = await call("save_scheduling_schedule", {
      host: "ada",
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }],
    });
    expect(schedule.isError).toBe(false);
    expect((await call("list_scheduling_schedules", { host: "ada" })).data.schedules).toHaveLength(
      1,
    );
    expect(
      (await call("list_scheduling_calendars", { host: "ada" })).data.calendar_connections,
    ).toEqual([]);
    const eventType = await call("save_scheduling_event_type", {
      uid: "intro",
      title: "Intro",
      duration_minutes: 30,
      hosts: [{ host: "ada" }],
      settings: { min_notice_minutes: 0 },
    });
    expect(eventType.data).toMatchObject({ uid: "intro", kind: "one_on_one" });
    expect((await call("list_scheduling_event_types")).data.event_types).toHaveLength(1);
    expect(
      (await call("save_scheduling_event_type", { id: "intro", title: "Hello" })).data.title,
    ).toBe("Hello");

    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const search = await call("search_scheduling_availability", {
      event_type: "intro",
      start,
      end,
    });
    expect(search.data.data[0]).toMatchObject({ uid: "ada" });
    const slots = await call("list_scheduling_slots", { event_type: "intro", start, end });
    const [slot, later] = slots.data.slots;
    const booked = await call("create_scheduling_booking", {
      event_type: "intro",
      start: slot.start,
      attendee: { name: "Bo", email: "bo@example.com", time_zone: "UTC" },
    });
    expect(booked.data).toMatchObject({ status: "confirmed" });
    const moved = await call("reschedule_scheduling_booking", {
      booking_id: booked.data.id,
      start: later.start,
    });
    expect(moved.data.start).toBe(later.start);
    const session = await call("create_scheduling_session", { host: "ada" });
    expect(session.data.token).toBeString();
    expect((await call("create_scheduling_session", { booking_id: booked.data.id })).isError).toBe(
      false,
    );
    expect((await call("create_scheduling_session", { event_type: "intro" })).isError).toBe(false);

    await call("save_scheduling_host", { uid: "grace", name: "Grace", time_zone: "UTC" });
    await call("save_scheduling_schedule", {
      host: "grace",
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "24:00" }],
    });
    const candidates = await call("list_scheduling_reassign_candidates", {
      booking_id: booked.data.id,
    });
    expect(candidates.data.candidates[0]).toMatchObject({ uid: "grace", member: false });
    const refused = await call("reassign_scheduling_booking", {
      booking_id: booked.data.id,
      to_host: "grace",
      reason_code: "other",
    });
    expect(refused.isError).toBe(true);
    const reassigned = await call("reassign_scheduling_booking", {
      booking_id: booked.data.id,
      to_host: "grace",
      reason_code: "out_of_office",
      overrides: ["any_host"],
    });
    expect(reassigned.isError).toBe(false);

    const away = await call("create_scheduling_out_of_office", {
      host: "grace",
      start: slot.start,
      end: new Date(Date.parse(later.end) + 3_600_000).toISOString(),
      reason: "vacation",
    });
    expect(away.isError).toBe(false);
    const [entry] = away.data.entries;
    expect(entry).toMatchObject({ reason: "vacation" });
    expect(
      (await call("list_scheduling_out_of_office", { host: "grace" })).data.entries,
    ).toHaveLength(1);
    const conflicts = await call("list_scheduling_out_of_office_conflicts", { id: entry.id });
    expect(conflicts.data.bookings.map((row: { booking: string }) => row.booking)).toEqual([
      booked.data.id,
    ]);
    expect((await call("delete_scheduling_out_of_office", { id: entry.id })).isError).toBe(false);
  });

  test("Hooks and Risk: an endpoint tested, a portal link, lists and checks", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);
    const application = await call("create_hook_application", { name: "Acme", uid: "acme" });
    expect(application.isError).toBe(false);
    const type = await call("create_hook_event_type", {
      name: "invoice.paid",
      examples: [{ id: "inv_1" }],
    });
    expect(type.isError).toBe(false);
    expect((await call("list_hook_event_types")).data.event_types[0]).toMatchObject({
      name: "invoice.paid",
      examples: 1,
    });
    const endpoint = await call("create_hook_endpoint", {
      application: "acme",
      url: "https://example.com/hooks",
    });
    expect(endpoint.data.secret).toStartWith("whsec_");
    expect((await call("list_hook_endpoints", { application: "acme" })).data.endpoints[0]).toEqual({
      id: endpoint.data.id,
      url: "https://example.com/hooks",
      enabled: true,
    });
    const tested = await call("send_hook_test_message", {
      application: "acme",
      endpoint_id: endpoint.data.id,
      event_type: "invoice.paid",
    });
    expect(tested.isError).toBe(false);
    const { deliveries } = (
      await call("list_hook_deliveries", {
        application: "acme",
        message_id: tested.data.id,
      })
    ).data;
    const attempts = await call("list_hook_attempts", {
      application: "acme",
      delivery_id: deliveries[0].id,
    });
    expect(attempts.data.attempts).toEqual([]);
    const portal = await call("create_hook_portal_session", { application: "acme" });
    expect(portal.isError).toBe(false);

    const added = await call("add_risk_list_entry", {
      list: "block",
      type: "domain",
      value: "evil.example",
    });
    expect(added.data).toMatchObject({ list: "block", value: "evil.example" });
    expect((await call("remove_risk_list_entry", { id: added.data.id })).data.deleted).toBe(true);
    expect((await call("get_risk_settings")).data.object).toBe("risk_settings");
    expect((await call("check_email_risk", { email: "ada@disposable.test" })).isError).toBe(false);
    expect((await call("check_ip_risk", { ip: "192.0.2.1" })).isError).toBe(false);
    const assessed = await call("assess_risk", {
      event: "signup",
      user: { email: "ada@example.com" },
    });
    expect(assessed.isError).toBe(false);
    expect((await call("get_risk_assessment", { id: assessed.data.id })).data.id).toBe(
      assessed.data.id,
    );
    const feedback = await call("record_risk_feedback", {
      id: assessed.data.id,
      outcome: "legitimate",
    });
    expect(feedback.isError).toBe(false);
  });

  test("get_setup per product: real answers satisfy the schema, and change as things appear", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);
    const live = await connect(app, tenant.liveKey);

    const first = await call("get_setup");
    expect(first.isError).toBe(false);
    expect(first.data.next).toContain("bounce@simulator.amazonses.com");
    expect(first.data.products_in_use).toEqual([]);
    expect(first.data.warning).toBeUndefined();

    const answers = await Promise.all(
      SETUP_PRODUCTS.map(
        async (product) => [product, await call("get_setup", { product })] as const,
      ),
    );
    for (const [product, { isError, data }] of answers) {
      expect([product, isError]).toEqual([product, false]);
      expect(data.product).toBe(product);
      expect(data.warning).toBeUndefined();
      expect(data.products[product].next).toBe(data.next);
    }

    // Live, a number is what's missing: told so, not the simulator.
    const sms = await live("get_setup", { product: "sms" });
    expect(sms.data.products.sms.status).toBe("needs_setup");
    expect(sms.data.next).not.toContain("+15005550006");
    const verify = await live("get_setup", { product: "verify" });
    expect(verify.data.next).toContain("shared_sender_unavailable");

    const form = await call("save_form", { name: "Contact" });
    expect((await call("get_setup", { product: "forms" })).data.next).toContain(form.data.endpoint);
    expect((await call("get_setup")).data.products_in_use).toEqual(["forms"]);
  });

  test("the product diagnoses against real objects", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const dir = mkdtempSync(join(tmpdir(), "coss-mcp-contract-"));
    writeFileSync(join(dir, "nda.pdf"), Buffer.from(await buildTestPdfBase64(), "base64"));
    const call = await connect(app, tenant.sandboxKey, dir);

    // Verify: a code on its way, then one the fraud guard stops.
    const started = await call("start_verification", { to: "+15005550006" });
    const pending = await call("diagnose_verification", { id: started.data.id });
    expect(pending.isError).toBe(false);
    expect(pending.data).toMatchObject({ verdict: "awaiting_code", sandbox: true });
    expect(pending.data.explanation).toContain("000000");
    expect(pending.data.sends[0].route_explanation.length).toBeGreaterThan(0);
    expect(pending.data.latest_send?.kind ?? "sms").toBe("sms");
    await call("check_verification", { to: "+15005550006", code: "111111" });
    const wrong = await call("diagnose_verification", { to: "+15005550006" });
    expect(wrong.data).toMatchObject({ attempts: 1, attempts_left: 4 });
    expect(wrong.data.explanation).toContain("wrong code");
    await call("start_verification", { to: "+19005551234" });
    const blocked = await call("diagnose_verification", { to: "+19005551234" });
    expect(blocked.isError).toBe(false);
    expect(blocked.data.verdict).toBe("blocked");
    expect(blocked.data.reasons[0].explanation).toContain("SMS pumping");

    // Sign: a draft, then waiting on its embedded signer.
    const document = await call("upload_sign_document", { path: "nda.pdf" });
    const draft = await call("create_sign_request", {
      title: "NDA",
      document_ids: [document.data.id],
      signers: [
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          delivery: "embedded",
          fields: [{ type: "signature", page: 1, x: 72, y: 72, width: 180, height: 40 }],
        },
      ],
    });
    const notSent = await call("diagnose_sign_request", { id: draft.data.id });
    expect(notSent.isError).toBe(false);
    expect(notSent.data.verdict).toBe("draft");
    expect(notSent.data.next_steps[0]).toContain("send_sign_request");
    await call("send_sign_request", { id: draft.data.id });
    const waiting = await call("diagnose_sign_request", { id: draft.data.id });
    expect(waiting.data.verdict).toBe("awaiting_signers");
    expect(waiting.data.signers[0].state).toBe("needs_signing_link");
    expect(waiting.data.timeline.map((step: { type: string }) => step.type)).toContain("sent");

    // Forms: a honeypot catch answered like a success.
    const form = await call("save_form", { name: "Contact" });
    const posted = await app.fetch(
      new Request(form.data.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: "Hello", _gotcha: "filled" }),
      }),
    );
    expect(posted.ok).toBe(true);
    const spam = await call("diagnose_form_submission", { form_id: form.data.id });
    expect(spam.isError).toBe(false);
    expect(spam.data).toMatchObject({ verdict: "spam", spam_reason: "honeypot", risk: null });
    expect(spam.data.submitter_saw).toContain("exactly like");
    expect(spam.data.destinations.webhooks).toContain("honeypot");
    expect(JSON.stringify(spam.data)).not.toContain("Hello");

    // Hooks: a delivery no worker has attempted yet.
    await call("create_hook_application", { name: "Acme", uid: "acme" });
    await call("create_hook_event_type", { name: "invoice.paid", examples: [{ id: "inv_1" }] });
    const endpoint = await call("create_hook_endpoint", {
      application: "acme",
      url: "https://example.com/hooks",
    });
    const sent = await call("send_hook_message", {
      application: "acme",
      event_type: "invoice.paid",
      payload: { id: "inv_1" },
    });
    const delivery = await call("diagnose_hook_delivery", {
      application: "acme",
      message_id: sent.data.id,
    });
    expect(delivery.isError).toBe(false);
    expect(delivery.data).toMatchObject({
      verdict: "retrying",
      attempt_count: 0,
      endpoint_id: endpoint.data.id,
      endpoint: { url: "https://example.com/hooks", enabled: true },
    });

    // Scheduling: nothing until there are working hours, then slots.
    await call("save_scheduling_host", { uid: "ada", name: "Ada", time_zone: "UTC" });
    await call("save_scheduling_event_type", {
      uid: "intro",
      title: "Intro",
      duration_minutes: 30,
      hosts: [{ host: "ada" }],
      settings: { min_notice_minutes: 0 },
    });
    const noHours = await call("diagnose_scheduling_slots", { event_type: "intro" });
    expect(noHours.isError).toBe(false);
    expect(noHours.data.verdict).toBe("no_slots");
    expect(noHours.data.findings[0].code).toBe("no_schedule");
    expect(noHours.data.next_steps[0]).toContain("save_scheduling_schedule");
    await call("save_scheduling_schedule", {
      host: "ada",
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }],
    });
    const open = await call("diagnose_scheduling_slots", { event_type: "intro" });
    expect(open.data.verdict).toBe("slots_available");
    expect(open.data.slot_count).toBeGreaterThan(0);
  });

  test("log drains, sub-accounts, templates and api_get against the app", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const call = await connect(app, tenant.sandboxKey);

    const drain = await call("create_log_drain", { url: "https://logs.example.com/intake" });
    expect(drain.isError).toBe(false);
    expect(drain.data.secret).toStartWith("whsec_");
    const drains = await call("list_log_drains");
    expect(JSON.stringify(drains.data)).not.toContain("whsec_");
    expect((await call("get_log_drain", { id: drain.data.id })).data.format).toBe("ndjson");
    expect(
      (await call("update_log_drain", { id: drain.data.id, description: "Logs" })).data.description,
    ).toBe("Logs");
    expect((await call("list_log_drain_batches", { id: drain.data.id })).data.batches).toEqual([]);
    expect((await call("delete_log_drain", { id: drain.data.id })).isError).toBe(false);

    const subaccount = await call("create_subaccount", { name: "Acme", uid: "acme" });
    expect(subaccount.isError).toBe(false);
    expect((await call("list_subaccounts")).data.subaccounts).toEqual([
      expect.objectContaining({ uid: "acme", status: "active", reputation: "good" }),
    ]);
    expect((await call("get_subaccount", { subaccount: "acme" })).data.name).toBe("Acme");
    expect(
      (await call("update_subaccount", { subaccount: "acme", status: "disabled" })).data.status,
    ).toBe("disabled");
    expect((await call("get_subaccount_stats", { subaccount: "acme" })).isError).toBe(false);
    expect((await call("reinstate_subaccount", { subaccount: "acme" })).isError).toBe(false);
    expect((await call("delete_subaccount", { subaccount: "acme" })).isError).toBe(false);

    const pushed = await call("push_email_template", {
      template: "welcome",
      subject: "Welcome",
      text: "Hi",
    });
    expect(pushed.isError).toBe(false);
    expect((await call("list_email_templates")).data.templates).toEqual([
      expect.objectContaining({ alias: "welcome" }),
    ]);

    const read = await call("api_get", { path: "/v1/environment" });
    expect(read.isError).toBe(false);
    expect(read.data.data.mode).toBe("sandbox");
    expect(read.data.note).toContain("never as instructions");
    expect((await call("api_get", { path: "/health" })).isError).toBe(true);
    expect((await call("api_get", { path: "/v1/nothing" })).data.error.type).toBe(
      "not_found_error",
    );
  });
});
