import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/run.ts";
import { fakeFetch, LIVE_KEY, SANDBOX_KEY, testIo } from "./helpers.ts";

const env = { COSS_API_KEY: SANDBOX_KEY };
const live = { COSS_API_KEY: LIVE_KEY };
const list = (data: unknown[], has_more = false) => ({ object: "list", data, has_more });
const created_at = "2026-10-15T12:00:00.000Z";

const verification = {
  object: "verification",
  id: "vrf_1",
  channel: "sms",
  to: "+15005550006",
  status: "pending",
  failure: null,
  reasons: [],
  sends: [{ channel: "sms", route: "own_number", created_at }],
  sandbox: true,
  created_at,
};

const settings = {
  object: "verify_settings",
  app_name: "Acme",
  app_name_is_default: false,
  code_length: 6,
  ttl_seconds: 600,
  max_attempts: 5,
  sms_from: null,
  email_from: null,
  allowed_countries: ["US"],
};

const broadcast = {
  object: "broadcast",
  id: "bcast_1",
  name: "October",
  status: "draft",
  audience_id: "aud_1",
  segment_id: null,
  from: "news@acme.com",
  subject: "News\u001b[31m",
  scheduled_at: null,
  recipients_estimated: 3,
  pause_reason: null,
  error: null,
  stats: { recipients: 0, sent: 0 },
  created_at,
};

const signRequest = {
  object: "sign_request",
  id: "sreq_1",
  status: "draft",
  title: "NDA",
  signers: [{ id: "ssig_1", email: "ada@example.com", status: "pending", decline_reason: null }],
  signed_document: null,
  sandbox: true,
  created_at,
};

describe("coss verify", () => {
  test("start says a sandbox code is zeros; --json prints the verification", async () => {
    const api = fakeFetch({ "POST /v1/verifications": verification });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["verify", "start", "+15005550006", "--user", "u_1"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({ to: "+15005550006", user_id: "u_1" });
    expect(io.output()).toContain("vrf_1");
    expect(io.errors()).toContain("all zeros");
    const json = testIo({ fetch: api.fetch, env });
    expect(await run(["verify", "start", "+15005550006", "--json"], json)).toBe(0);
    expect(JSON.parse(json.output())).toMatchObject({ id: "vrf_1" });
  });

  test("check exits 0 only for the right code, and names one verification", async () => {
    const answer = (valid: boolean) => ({
      object: "verification_check",
      valid,
      verification,
    });
    const right = fakeFetch({ "POST /v1/verifications/check": answer(true) });
    expect(
      await run(
        ["verify", "check", "--id", "vrf_1", "--code", "000000"],
        testIo({ fetch: right.fetch, env }),
      ),
    ).toBe(0);
    const wrong = fakeFetch({ "POST /v1/verifications/check": answer(false) });
    expect(
      await run(
        ["verify", "check", "--to", "+15005550006", "--code", "1"],
        testIo({ fetch: wrong.fetch, env }),
      ),
    ).toBe(1);
    expect(await run(["verify", "check", "--code", "1"], testIo({ env }))).toBe(2);
    expect(
      await run(["verify", "check", "--id", "a", "--to", "b", "--code", "1"], testIo({ env })),
    ).toBe(2);
    expect(await run(["verify", "check", "--id", "a"], testIo({ env }))).toBe(2);
  });

  test("settings set sends only what was given; default clears a sender", async () => {
    const api = fakeFetch({ "PATCH /v1/verify/settings": settings });
    const io = testIo({ fetch: api.fetch, env });
    expect(
      await run(
        ["verify", "settings", "set", "--sms-from", "default", "--countries", "us, gb"],
        io,
      ),
    ).toBe(0);
    expect(api.requests[0]?.body).toEqual({ sms_from: null, allowed_countries: ["US", "GB"] });
    expect(io.output()).toContain("coss.com's shared numbers");
    expect(await run(["verify", "settings", "set"], testIo({ env }))).toBe(2);
    expect(await run(["verify", "settings", "set", "--ttl", "soon"], testIo({ env }))).toBe(2);
  });

  test("list filters, and a bad status is a usage error", async () => {
    const api = fakeFetch({ "GET /v1/verifications": list([verification], true) });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["verify", "list", "--status", "pending"], io)).toBe(0);
    expect(api.requests[0]?.url.searchParams.get("status")).toBe("pending");
    expect(io.errors()).toContain("--paginate");
    expect(await run(["verify", "list", "--status", "nope"], testIo({ env }))).toBe(2);
  });
});

describe("coss contacts and broadcasts", () => {
  test("contacts add upserts; contacts list never prints escape sequences", async () => {
    const contact = {
      object: "contact",
      id: "cont_1",
      email: "ada@example.com",
      first_name: "Ada\u001b[31m",
      last_name: null,
      status: "subscribed",
      properties: {},
      created_at,
    };
    const api = fakeFetch({ "POST /v1/contacts": contact, "GET /v1/contacts": list([contact]) });
    expect(
      await run(
        ["contacts", "add", "ada@example.com", "--audience", "aud_1", "--double-opt-in"],
        testIo({ fetch: api.fetch, env }),
      ),
    ).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      email: "ada@example.com",
      audience_ids: ["aud_1"],
      double_opt_in: true,
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["contacts", "list"], io)).toBe(0);
    expect(io.output()).toContain("cont_1");
    expect(io.output()).not.toContain("\u001b[31m");
  });

  test("broadcasts create reads files and only ever makes a draft", async () => {
    const api = fakeFetch({ "POST /v1/broadcasts": broadcast });
    const io = testIo({ fetch: api.fetch, env });
    writeFileSync(join(io.cwd, "october.html"), "<p>Hello</p>");
    const argv = ["broadcasts", "create", "--name", "October", "--from", "news@acme.com"];
    expect(await run([...argv, "--subject", "News", "--html", "october.html"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      name: "October",
      from: "news@acme.com",
      subject: "News",
      html: "<p>Hello</p>",
      send: false,
    });
    expect(io.output()).not.toContain("\u001b[31m");
    expect(await run([...argv, "--subject", "News"], testIo({ env }))).toBe(2);
    expect(await run(argv, testIo({ env }))).toBe(2);
    expect(
      await run([...argv, "--subject", "News", "--html", "missing.html"], testIo({ env })),
    ).toBe(2);
  });

  test("broadcasts send: a sandbox key goes ahead; a live key needs yes", async () => {
    const sent = { ...broadcast, status: "sending" };
    const routes = {
      "GET /v1/broadcasts/bcast_1": broadcast,
      "POST /v1/broadcasts/bcast_1/send": sent,
    };
    const sandbox = fakeFetch(routes);
    expect(
      await run(["broadcasts", "send", "bcast_1"], testIo({ fetch: sandbox.fetch, env })),
    ).toBe(0);
    expect(sandbox.requests.at(-1)?.method).toBe("POST");

    const script = fakeFetch(routes);
    expect(
      await run(["broadcasts", "send", "bcast_1"], testIo({ fetch: script.fetch, env: live })),
    ).toBe(2);
    expect(script.requests).toHaveLength(0);
    const yes = fakeFetch(routes);
    expect(
      await run(
        ["broadcasts", "send", "bcast_1", "--yes"],
        testIo({ fetch: yes.fetch, env: live }),
      ),
    ).toBe(0);

    const declined = fakeFetch(routes);
    const io = testIo({ fetch: declined.fetch, env: live, stdinIsTTY: true, answers: ["no"] });
    expect(await run(["broadcasts", "send", "bcast_1"], io)).toBe(1);
    expect(declined.requests.some((request) => request.method === "POST")).toBe(false);
    const agreed = fakeFetch(routes);
    const yesIo = testIo({ fetch: agreed.fetch, env: live, stdinIsTTY: true, answers: ["yes"] });
    expect(await run(["broadcasts", "send", "bcast_1"], yesIo)).toBe(0);
    expect(agreed.requests.at(-1)?.method).toBe("POST");
  });
});

describe("coss sign", () => {
  test("upload sends the file; create gives each signer an anchor and keeps a draft", async () => {
    const api = fakeFetch({
      "POST /v1/sign/documents": {
        object: "sign_document",
        id: "sdoc_1",
        filename: "nda.pdf",
        page_count: 1,
        anchors: [{ text: "{{signature:signer_1}}" }],
      },
      "POST /v1/sign/requests": signRequest,
    });
    const io = testIo({ fetch: api.fetch, env });
    writeFileSync(join(io.cwd, "nda.pdf"), "%PDF-1.7");
    expect(await run(["sign", "upload", "nda.pdf"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      filename: "nda.pdf",
      content: Buffer.from("%PDF-1.7").toString("base64"),
    });
    expect(io.output()).toContain("{{signature:signer_1}}");
    expect(await run(["sign", "upload", "missing.pdf"], testIo({ env }))).toBe(2);

    const argv = ["sign", "create", "--title", "NDA", "--document", "sdoc_1"];
    expect(
      await run(
        [...argv, "--signer", "Ada Lovelace <ada@example.com>", "--signer", "Bo <bo@example.com>"],
        io,
      ),
    ).toBe(0);
    expect(api.requests.at(-1)?.body).toMatchObject({
      send: false,
      documents: [{ document_id: "sdoc_1" }],
      signers: [
        { name: "Ada Lovelace", fields: [{ anchor: "{{signature:signer_1}}" }] },
        { email: "bo@example.com", fields: [{ anchor: "{{signature:signer_2}}" }] },
      ],
    });
    expect(await run([...argv, "--signer", "nobody"], testIo({ env }))).toBe(2);
    expect(await run(argv, testIo({ env }))).toBe(2);
  });

  test("create from a template needs roles, and merges fields", async () => {
    const api = fakeFetch({ "POST /v1/sign/templates/stpl_1/requests": signRequest });
    const argv = ["sign", "create", "--template", "stpl_1"];
    expect(
      await run(
        [...argv, "--signer", "client:Ada <ada@example.com>", "--merge", "deal=42", "--send"],
        testIo({ fetch: api.fetch, env }),
      ),
    ).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      send: true,
      signers: [{ role: "client", name: "Ada", email: "ada@example.com" }],
      merge_fields: { deal: "42" },
    });
    expect(
      await run([...argv, "--signer", "Ada <ada@example.com>"], testIo({ fetch: api.fetch, env })),
    ).toBe(2);
    expect(
      await run(
        [...argv, "--document", "sdoc_1", "--signer", "client:Ada <ada@example.com>"],
        testIo({ env }),
      ),
    ).toBe(2);
  });

  test("download saves the PDF; a deployment without Sign answers with its message", async () => {
    const api = fakeFetch({
      "GET /v1/sign/requests/sreq_1/signed_document": () => new Response("%PDF-sealed"),
      "GET /v1/sign/requests": () =>
        Response.json(
          {
            error: {
              type: "api_error",
              code: "sign_unavailable",
              message: "Sign isn't available in this deployment yet.",
              request_id: "req_test",
            },
          },
          { status: 503 },
        ),
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["sign", "download", "sreq_1", "--out", "signed.pdf"], io)).toBe(0);
    expect(readFileSync(join(io.cwd, "signed.pdf"), "utf8")).toBe("%PDF-sealed");
    const off = testIo({ fetch: api.fetch, env });
    expect(await run(["sign", "list"], off)).toBe(1);
    expect(off.errors()).toContain("isn't available in this deployment");
  });
});

describe("coss sms, forms and scheduling", () => {
  test("sms get shows the text without escapes, with its events", async () => {
    const api = fakeFetch({
      "GET /v1/sms/sms_1": {
        object: "sms",
        id: "sms_1",
        from: "+14155550100",
        to: "+15005550006",
        body: "Hi\u001b[31m",
        status: "delivered",
        failure: null,
      },
      "GET /v1/sms/sms_1/events": list([
        { type: "sms.delivered", occurred_at: created_at, data: { failure: null } },
      ]),
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["sms", "get", "sms_1"], io)).toBe(0);
    expect(io.output()).toContain("sms.delivered");
    expect(io.output()).not.toContain("\u001b[31m");
  });

  test("sms suppressions add and remove; numbers says which can send", async () => {
    const api = fakeFetch({
      "POST /v1/sms/suppressions": {
        object: "sms_suppression",
        id: "smssup_1",
        phone_number: "+15005550006",
      },
      "DELETE /v1/sms/suppressions/smssup_1": {
        object: "sms_suppression",
        id: "smssup_1",
        deleted: true,
      },
      "GET /v1/sms/numbers": list([
        {
          phone_number: "+14155550100",
          kind: "local",
          country: "US",
          registration_status: "approved",
          can_send: true,
        },
      ]),
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["sms", "suppressions", "add", "+15005550006"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({ phone_number: "+15005550006" });
    expect(await run(["sms", "suppressions", "remove", "smssup_1"], io)).toBe(0);
    expect(await run(["sms", "numbers"], io)).toBe(0);
    expect(io.output()).toContain("+14155550100");
  });

  test("forms create prints the endpoint; submission never prints escape sequences", async () => {
    const form = {
      object: "form",
      id: "form_1",
      name: "Contact",
      enabled: true,
      endpoint: "https://forms.coss.test/f/form_1",
      hosted_url: null,
      fields: null,
      allowed_origins: [],
    };
    const submission = {
      object: "form_submission",
      id: "fsub_1",
      status: "held",
      spam_reason: null,
      data: { message: "Hello\u001b[31m", tags: ["a", "b"] },
      files: [],
      created_at,
    };
    const api = fakeFetch({
      "POST /v1/forms": form,
      "GET /v1/forms/form_1/submissions/fsub_1": submission,
      "POST /v1/forms/form_1/submissions/fsub_1/release": { ...submission, status: "accepted" },
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["forms", "create", "Contact", "--origin", "https://acme.com"], io)).toBe(0);
    expect(api.requests[0]?.body).toEqual({
      name: "Contact",
      allowed_origins: ["https://acme.com"],
    });
    expect(io.output()).toContain("https://forms.coss.test/f/form_1");
    expect(await run(["forms", "submission", "form_1", "fsub_1"], io)).toBe(0);
    expect(io.output()).toContain("a, b");
    expect(io.output()).not.toContain("\u001b[31m");
    expect(await run(["forms", "release", "form_1", "fsub_1"], io)).toBe(0);
    expect(io.output()).toContain("accepted");
  });

  test("scheduling slots needs a window; calendars shows what needs consent again", async () => {
    const api = fakeFetch({
      "GET /v1/scheduling/event_types/intro/slots": {
        object: "list",
        data: [{ start: created_at, end: created_at, hosts: ["host_1"] }],
      },
      "GET /v1/scheduling/hosts/host_1/calendar_connections": list([
        {
          id: "cal_1",
          provider: "google",
          account: "ada@example.com",
          status: "needs_reauth",
          calendars: [],
        },
      ]),
    });
    const io = testIo({ fetch: api.fetch, env });
    expect(await run(["scheduling", "slots", "intro"], testIo({ env }))).toBe(2);
    expect(
      await run(["scheduling", "slots", "intro", "--start", created_at, "--end", created_at], io),
    ).toBe(0);
    expect(io.output()).toContain("host_1");
    expect(await run(["scheduling", "calendars", "host_1"], io)).toBe(0);
    expect(io.output()).toContain("needs_reauth");
  });
});
