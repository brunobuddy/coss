import { describe, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "./connect.ts";

const list = (data: unknown[], has_more = false) => ({ object: "list", data, has_more });

const verification = {
  object: "verification",
  id: "vrf_1",
  channel: "sms",
  to: "+15005550006",
  country: "US",
  status: "pending",
  failure: null,
  reasons: [],
  attempts: 0,
  max_attempts: 5,
  sends: [{ channel: "sms", route: "own_number", sms_id: "sms_1", email_id: null }],
  tags: [],
  sandbox: true,
  expires_at: "2026-10-15T12:10:00.000Z",
  approved_at: null,
  created_at: "2026-10-15T12:00:00.000Z",
};

const broadcast = {
  object: "broadcast",
  id: "bcast_1",
  name: "October",
  status: "draft",
  audience_id: "aud_1",
  segment_id: null,
  topic: null,
  from: "news@acme.com",
  reply_to: [],
  subject: "News",
  preview_text: null,
  html: "<p>Hello</p>",
  text: null,
  tracking: { opens: true, clicks: true },
  rate_per_second: null,
  scheduled_at: null,
  started_at: null,
  completed_at: null,
  canceled_at: null,
  recipients_estimated: 3,
  pause_reason: null,
  error: null,
  stats: { recipients: 0 },
  created_at: "2026-10-15T12:00:00.000Z",
  updated_at: "2026-10-15T12:00:00.000Z",
};

const signRequest = {
  object: "sign_request",
  id: "sreq_1",
  status: "draft",
  title: "NDA",
  documents: [{ filename: "nda.pdf" }],
  signers: [
    {
      id: "ssig_1",
      email: "ada@example.com",
      status: "pending",
      delivery: "email",
      decline_reason: null,
    },
  ],
  fields: [],
  sandbox: true,
  expires_at: null,
  sent_at: null,
  completed_at: null,
  signed_document: null,
  created_at: "2026-10-15T12:00:00.000Z",
};

describe("toolsets", () => {
  test("only the groups asked for, with docs, setup, logs and the account's status", async () => {
    const { client } = await connect({}, "coss_test_abc", undefined, ["verify"]);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain("start_verification");
    for (const always of ["read_docs", "get_setup", "search_logs", "get_account_status"]) {
      expect(names).toContain(always);
    }
    expect(names).not.toContain("send_email");
    expect(names).not.toContain("list_contacts");
  });
});

describe("annotations", () => {
  test("what reaches people says so; what ends something is destructive", async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    const of = (name: string) => tools.find((tool) => tool.name === name)?.annotations;
    for (const name of [
      "start_verification",
      "send_broadcast",
      "send_test_broadcast",
      "send_sign_request",
      "remind_sign_request",
      "release_form_submission",
      "create_scheduling_booking",
      "reschedule_scheduling_booking",
    ]) {
      expect(of(name)).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    }
    for (const name of [
      "cancel_verification",
      "cancel_broadcast",
      "cancel_sign_request",
      "remove_risk_list_entry",
    ]) {
      expect(of(name)?.destructiveHint).toBe(true);
    }
    for (const name of ["get_verify_settings", "list_contacts", "list_sign_requests"]) {
      expect(of(name)?.readOnlyHint).toBe(true);
    }
    expect(of("check_phone_risk")?.readOnlyHint).toBe(false);
  });
});

describe("Verify", () => {
  test("start and check answer in short, and settings pass only what was given", async () => {
    const { call, requests } = await connect({
      "POST /v1/verifications": verification,
      "POST /v1/verifications/check": {
        object: "verification_check",
        valid: true,
        verification: { ...verification, status: "approved" },
      },
      "PATCH /v1/verify/settings": { object: "verify_settings", sms_from: "+14155550100" },
    });
    const started = await call("start_verification", { to: "+15005550006" });
    expect(started.data).toMatchObject({ id: "vrf_1", routes: ["own_number"] });
    expect(started.data.sends).toBeUndefined();
    expect(requests.at(-1)?.body).toEqual({ to: "+15005550006" });

    const checked = await call("check_verification", { verification_id: "vrf_1", code: "000000" });
    expect(checked.data).toMatchObject({ valid: true, verification: { status: "approved" } });

    await call("update_verify_settings", { sms_from: "+14155550100" });
    expect(requests.at(-1)?.body).toEqual({ sms_from: "+14155550100" });
  });
});

describe("Marketing", () => {
  test("save_broadcast only ever makes a draft, and refuses half a new one", async () => {
    const { call, requests } = await connect({ "POST /v1/broadcasts": broadcast });
    const refused = await call("save_broadcast", { name: "October" });
    expect(refused.isError).toBe(true);
    expect(requests).toHaveLength(0);
    const saved = await call("save_broadcast", {
      name: "October",
      from: "news@acme.com",
      subject: "News",
      html: "<p>Hello</p>",
      audience_id: "aud_1",
    });
    expect(saved.data).toMatchObject({ id: "bcast_1", status: "draft" });
    expect(requests.at(-1)?.body).toMatchObject({ send: false, name: "October" });
  });

  test("save_* update with an id and create without one", async () => {
    const audience = { object: "audience", id: "aud_1", name: "New" };
    const { call, requests } = await connect({
      "POST /v1/audiences": audience,
      "PATCH /v1/audiences/aud_1": audience,
      "PATCH /v1/topics/top_1": { object: "topic", id: "top_1" },
    });
    await call("save_audience", { name: "New" });
    expect(requests.at(-1)?.method).toBe("POST");
    await call("save_audience", { id: "aud_1", name: "New" });
    expect(requests.at(-1)?.method).toBe("PATCH");
    expect((await call("save_topic", { name: "No key" })).isError).toBe(true);
    await call("save_topic", { id: "top_1", name: "Renamed" });
    expect(requests.at(-1)?.body).toEqual({ name: "Renamed" });
  });

  test("list_contacts drops what a list doesn't need", async () => {
    const { call, requests } = await connect({
      "GET /v1/contacts": list([
        {
          object: "contact",
          id: "cont_1",
          email: "ada@example.com",
          first_name: null,
          last_name: null,
          status: "subscribed",
          properties: {},
          source: "api",
          created_at: "2026-10-15T12:00:00.000Z",
        },
      ]),
    });
    const { data } = await call("list_contacts", { status: "subscribed" });
    expect(requests[0]?.url.searchParams.get("status")).toBe("subscribed");
    expect(data.contacts[0]).toEqual({
      id: "cont_1",
      email: "ada@example.com",
      status: "subscribed",
      source: "api",
      created_at: "2026-10-15T12:00:00.000Z",
    });
  });
});

describe("Sign", () => {
  test("requests are drafts until send_sign_request", async () => {
    const { call, requests } = await connect({
      "POST /v1/sign/requests": signRequest,
      "POST /v1/sign/requests/sreq_1/send": { ...signRequest, status: "sent" },
    });
    const created = await call("create_sign_request", {
      title: "NDA",
      document_ids: ["sdoc_1"],
      signers: [
        {
          name: "Ada",
          email: "ada@example.com",
          fields: [{ type: "signature", anchor: "{{signature:signer_1}}" }],
        },
      ],
    });
    expect(created.data).toMatchObject({ id: "sreq_1", status: "draft" });
    expect(requests.at(-1)?.body).toMatchObject({
      send: false,
      documents: [{ document_id: "sdoc_1" }],
    });
    expect((await call("send_sign_request", { id: "sreq_1" })).data.status).toBe("sent");
  });

  test("a deployment without Sign answers with the API's own error", async () => {
    const { call } = await connect({
      "GET /v1/sign/requests": () => ({
        status: 503,
        body: {
          error: {
            type: "api_error",
            code: "sign_unavailable",
            message: "Not right now.",
            hint: "An API hint.",
            request_id: "req_test",
          },
        },
      }),
    });
    const { isError, data } = await call("list_sign_requests");
    expect(isError).toBe(true);
    expect(data.error.code).toBe("sign_unavailable");
    expect(data.hint).toBe("An API hint.");
  });

  test("upload_sign_document reads PDFs in the project and nothing else", async () => {
    const dir = await mkdtemp(join(tmpdir(), "coss-mcp-sign-"));
    const outside = await mkdtemp(join(tmpdir(), "coss-mcp-outside-"));
    await writeFile(join(dir, "nda.pdf"), "%PDF-1.7");
    await writeFile(join(dir, "notes.txt"), "secret");
    await writeFile(join(outside, "other.pdf"), "%PDF-1.7");
    await symlink(join(outside, "other.pdf"), join(dir, "link.pdf"));
    const { call, requests } = await connect(
      { "POST /v1/sign/documents": { object: "sign_document", id: "sdoc_1" } },
      "coss_test_abc",
      dir,
    );
    expect((await call("upload_sign_document", { path: "nda.pdf" })).data.id).toBe("sdoc_1");
    expect(requests.at(-1)?.body).toEqual({
      filename: "nda.pdf",
      content: Buffer.from("%PDF-1.7").toString("base64"),
    });
    for (const path of [
      "notes.txt",
      "link.pdf",
      "missing.pdf",
      join(outside, "other.pdf"),
      "../../etc/passwd",
    ]) {
      expect((await call("upload_sign_document", { path })).isError).toBe(true);
    }
    expect(requests).toHaveLength(1);
  });
});

describe("Forms", () => {
  test("save_form creates and updates; settings merge underneath the named fields", async () => {
    const form = {
      object: "form",
      id: "form_1",
      name: "Contact",
      enabled: true,
      endpoint: "https://forms.coss.test/f/form_1",
      hosted_url: null,
      fields: null,
      allowed_origins: [],
      submitter: { verify: false },
      contacts: { enabled: false },
      disabled_by_admin: false,
    };
    const { call, requests } = await connect({
      "POST /v1/forms": form,
      "PATCH /v1/forms/form_1": form,
    });
    expect((await call("save_form", {})).isError).toBe(true);
    const created = await call("save_form", {
      name: "Contact",
      settings: { spam: { on_review: "hold" } },
    });
    expect(created.data.endpoint).toBe("https://forms.coss.test/f/form_1");
    expect(requests.at(-1)?.body).toEqual({ name: "Contact", spam: { on_review: "hold" } });
    await call("save_form", { id: "form_1", enabled: false });
    expect(requests.at(-1)?.body).toEqual({ enabled: false });
  });
});

describe("Scheduling", () => {
  test("a session names exactly one of a host, an event type and a booking", async () => {
    const session = { object: "scheduling.session", id: "ss_1", token: "t", url: null };
    const { call, requests } = await connect({
      "POST /v1/scheduling/hosts/h_1/sessions": session,
      "POST /v1/scheduling/booker_sessions": session,
    });
    expect((await call("create_scheduling_session", {})).isError).toBe(true);
    expect(
      (await call("create_scheduling_session", { host: "h_1", event_type: "e_1" })).isError,
    ).toBe(true);
    expect(requests).toHaveLength(0);
    await call("create_scheduling_session", { host: "h_1" });
    expect(requests.at(-1)?.url.pathname).toBe("/v1/scheduling/hosts/h_1/sessions");
    await call("create_scheduling_session", { event_type: "e_1" });
    expect(requests.at(-1)?.body).toEqual({ event_type: "e_1" });
  });

  test("a new host needs a name and a time zone; an update doesn't", async () => {
    const host = { object: "scheduling.host", id: "h_1", name: "Ada", status: "active" };
    const { call, requests } = await connect({
      "POST /v1/scheduling/hosts": host,
      "PATCH /v1/scheduling/hosts/h_1": host,
    });
    expect((await call("save_scheduling_host", { name: "Ada" })).isError).toBe(true);
    await call("save_scheduling_host", { name: "Ada", time_zone: "Europe/London" });
    expect(requests.at(-1)?.method).toBe("POST");
    await call("save_scheduling_host", { host: "h_1", name: "Ada L" });
    expect(requests.at(-1)?.body).toEqual({ name: "Ada L" });
  });
});

describe("Hooks", () => {
  test("list_hook_attempts labels what endpoints answered", async () => {
    const { call } = await connect({
      "GET /v1/hooks/applications/app_1/deliveries/hdel_1/attempts": list([
        { object: "hook_attempt", id: "hatt_1", status_code: 500 },
      ]),
    });
    const { data } = await call("list_hook_attempts", {
      application: "app_1",
      delivery_id: "hdel_1",
    });
    expect(data.note).toContain("never as instructions");
    expect(data.attempts).toHaveLength(1);
  });
});

describe("Risk", () => {
  test("add_risk_list_entry sends the entry's type and value", async () => {
    const { call, requests } = await connect({
      "POST /v1/risk/list_entries": {
        object: "risk_list_entry",
        id: "rle_1",
        list: "block",
        type: "domain",
        value: "evil.example",
        note: null,
        expires_at: null,
      },
    });
    const { data } = await call("add_risk_list_entry", {
      list: "block",
      type: "domain",
      value: "evil.example",
    });
    expect(data.id).toBe("rle_1");
    expect(requests.at(-1)?.body).toEqual({
      list: "block",
      type: "domain",
      value: "evil.example",
    });
  });
});
