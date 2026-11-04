import { describe, expect, test } from "bun:test";
import { Coss } from "../src/index.ts";
import {
  describeSetup,
  fetchSetupReport,
  SANDBOX_FROM,
  SETUP_PRODUCTS,
  type SetupProduct,
  SIMULATOR_TO,
} from "../src/setup.ts";
import { apiError, json, mockFetch } from "./helpers.ts";

const record = (status = "missing") => ({
  type: "TXT",
  name: "acme.test",
  value: "v=spf1",
  status,
  required: true,
});

describe("describeSetup", () => {
  test("a sandbox key can send from the example address and should use the simulator", () => {
    const report = describeSetup({ mode: "sandbox", domains: [], webhookEndpoints: [] });
    expect(report.from).toBe(SANDBOX_FROM);
    expect(report.next).toContain(SIMULATOR_TO);
    expect(report.next).toContain("diagnose_email");
    expect(report.next).toContain("npx coss-cli listen");
  });

  test("a live key with a domain that can send is ready", () => {
    const report = describeSetup({
      mode: "live",
      domains: [{ name: "acme.test", can_send: true, records: [record("verified")] }],
      webhookEndpoints: [{ id: "whep_1", url: "https://example.com/hook", enabled: true }],
    });
    expect(report.from).toBe("hello@acme.test");
    expect(report.missing_dns).toEqual([]);
    expect(report.next).toBe("Ready to send from hello@acme.test.");
  });

  test("a live key without a verified domain lists the missing required records", () => {
    const optional = { ...record("missing"), required: false, type: "TXT" };
    const report = describeSetup({
      mode: "live",
      domains: [{ name: "acme.test", can_send: false, records: [record(), optional] }],
      webhookEndpoints: [],
    });
    expect(report.from).toBeNull();
    expect(report.missing_dns).toEqual([
      {
        domain: "acme.test",
        type: "TXT",
        name: "acme.test",
        value: "v=spf1",
        status: "missing",
        required: true,
      },
    ]);
    expect(report.next).toContain("acme.test");
    expect(report.next).toContain("production key");
  });

  test("a domain that can send is ready even when another domain still needs DNS", () => {
    const report = describeSetup({
      mode: "live",
      domains: [
        { name: "acme.test", can_send: false, records: [record()] },
        { name: "ready.test", can_send: true, records: [record("missing")] },
      ],
      webhookEndpoints: [],
    });
    expect(report.from).toBe("hello@ready.test");
    expect(report.missing_dns.map((entry) => entry.domain)).toEqual(["acme.test"]);
    expect(report.next).toBe(
      "Ready to send from hello@ready.test. No webhook endpoints yet: `npx coss-cli webhooks add <url>` registers one and saves its signing secret, or `npx coss-cli listen` forwards events to localhost.",
    );
  });

  test("a live key with no domains says to add one", () => {
    const report = describeSetup({ mode: "live", domains: [], webhookEndpoints: [] });
    expect(report.from).toBeNull();
    expect(report.next).toContain("Add a sending domain");
  });
});

describe("fetchSetupReport", () => {
  test("keeps a next step when the lists fail", async () => {
    const { fetch } = mockFetch(
      json(200, { object: "environment", mode: "sandbox" }),
      apiError(404, { type: "not_found_error", code: "not_found", message: "Not found." }),
      apiError(404, { type: "not_found_error", code: "not_found", message: "Not found." }),
    );
    const report = await fetchSetupReport(
      new Coss({ apiKey: "coss_test_x", fetch, maxRetries: 0 }),
    );
    expect(report.mode).toBe("sandbox");
    expect(report.from).toBe(SANDBOX_FROM);
    expect(report.warning).toBe(
      "Couldn't list domains (Not found.). Couldn't list webhook endpoints (Not found.).",
    );
    expect(report.next).toContain(SIMULATOR_TO);
  });

  test("an environment error still returns a next step", async () => {
    const { fetch } = mockFetch(
      apiError(401, { type: "authentication_error", code: "invalid_api_key", message: "Bad key." }),
    );
    const report = await fetchSetupReport(
      new Coss({ apiKey: "coss_test_x", fetch, maxRetries: 0 }),
    );
    expect(report.mode).toBe("unknown");
    expect(report.warning).toContain("Bad key.");
    expect(report.next).toContain(SIMULATOR_TO);
  });
});

const list = (data: unknown[]) => ({ object: "list", data, has_more: false });
const PERMISSIONS = ["email:read", "sms:read", "verify:read", "sign:read", "form:read"];

/** A `Coss` answering `METHOD /path` from a table (404 otherwise), recording what it was asked. */
function fakeCoss(mode: "live" | "sandbox", routes: Record<string, unknown> = {}) {
  const asked: string[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const route = `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
    asked.push(route);
    const answers: Record<string, unknown> = {
      "GET /v1/environment": { object: "environment", mode },
      "GET /v1/domains": list([]),
      "GET /v1/webhook_endpoints": list([]),
      ...routes,
    };
    return route in answers
      ? Response.json(answers[route])
      : Response.json(
          {
            error: {
              type: "api_error",
              code: "broken",
              message: "It broke.",
              request_id: "req",
            },
          },
          { status: 500 },
        );
  };
  return { coss: new Coss({ apiKey: "coss_test_x", fetch, maxRetries: 0 }), asked };
}

const number = (phone_number: string, can_send: boolean) => ({
  object: "sms_number",
  id: phone_number,
  phone_number,
  kind: "local",
  country: "US",
  status: can_send ? "active" : "pending",
  registration_status: can_send ? "approved" : "in_review",
  can_send,
  receives_here: true,
  created_at: "t",
});

const emptyProducts = {
  "GET /v1/emails": list([]),
  "GET /v1/sms": list([]),
  "GET /v1/verifications": list([]),
  "GET /v1/sign/requests": list([]),
  "GET /v1/forms": list([]),
  "GET /v1/scheduling/event_types": list([]),
  "GET /v1/inboxes": list([]),
  "GET /v1/hooks/applications": list([]),
  "GET /v1/risk/assessments": list([]),
  "GET /v1/contacts": list([]),
};

describe("per-product setup", () => {
  test("the shape stays additive: the old fields, plus products", () => {
    const report = describeSetup({ mode: "sandbox", domains: [], webhookEndpoints: [] });
    expect(Object.keys(report)).toEqual(
      expect.arrayContaining(["mode", "from", "missing_dns", "webhook_endpoints", "next"]),
    );
    expect(report.products.email?.status).toBe("ready");
    expect(report.product).toBeUndefined();
  });

  test("without a product: email-first, and the products in use from one small read each", async () => {
    const { coss, asked } = fakeCoss("sandbox", {
      ...emptyProducts,
      "GET /v1/forms": list([{ id: "form_1" }]),
      "GET /v1/hooks/applications": list([{ id: "happ_1" }]),
    });
    const report = await fetchSetupReport(coss);
    expect(report.next).toContain(SIMULATOR_TO);
    expect(report.products_in_use).toEqual(["forms", "hooks"]);
    expect(report.products.forms).toBeUndefined();
    expect(report.warning).toBeUndefined();
    expect(asked.length).toBe(13);
  });

  test("the probes skip what a restricted key can't read", async () => {
    const { coss, asked } = fakeCoss("sandbox", {
      ...emptyProducts,
      "GET /v1/environment": {
        object: "environment",
        mode: "sandbox",
        api_key: { permissions: PERMISSIONS },
      },
    });
    await fetchSetupReport(coss);
    expect(asked).not.toContain("GET /v1/hooks/applications");
    expect(asked).toContain("GET /v1/forms");
  });

  test("a probe that answers 503 isn't news; one that breaks is a warning", async () => {
    const unavailable = {
      error: { type: "api_error", code: "unavailable", message: "Off.", request_id: "req" },
    };
    const fetch = async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/v1/environment") return Response.json({ mode: "sandbox" });
      if (path === "/v1/domains" || path === "/v1/webhook_endpoints") {
        return Response.json(list([]));
      }
      return Response.json(unavailable, { status: 503 });
    };
    const report = await fetchSetupReport(
      new Coss({ apiKey: "coss_test_x", fetch, maxRetries: 0 }),
    );
    expect(report.warning).toBeUndefined();
    expect(report.products_in_use).toEqual([]);

    const broken = await fetchSetupReport(fakeCoss("sandbox").coss);
    expect(broken.warning).toContain("Couldn't tell which products are in use");
    expect(broken.next).toContain(SIMULATOR_TO);
  });

  test("one product reads only what it needs", async () => {
    const { coss, asked } = fakeCoss("live", {
      "GET /v1/sms/numbers": list([number("+14155550123", true)]),
    });
    const report = await fetchSetupReport(coss, { product: "sms" });
    expect(asked.sort()).toEqual([
      "GET /v1/domains",
      "GET /v1/environment",
      "GET /v1/sms/numbers",
      "GET /v1/webhook_endpoints",
    ]);
    expect(report.product).toBe("sms");
    expect(report.next).toBe("Ready to send from +14155550123.");
    expect(report.products.sms?.status).toBe("ready");
    expect(report.products.email?.status).toBe("needs_setup");
    expect(report.products_in_use).toBeUndefined();
  });

  test("a sandbox key needs no reads to be told the simulator", async () => {
    const steps: [SetupProduct, string][] = [
      ["sms", "+15005550004"],
      ["verify", "000000"],
      ["sign", "{{signature:signer_1}}"],
      ["risk", "192.0.2.1"],
    ];
    for (const [product, expected] of steps) {
      const { coss, asked } = fakeCoss("sandbox");
      const report = await fetchSetupReport(coss, { product });
      expect(report.next).toContain(expected);
      expect(report.next).not.toContain(SIMULATOR_TO);
      expect(report.products[product]?.status).toBe("ready");
      expect(report.warning).toBeUndefined();
      expect(asked.length).toBe(3);
    }
  });

  test("SMS in live: no number, a number still registering", async () => {
    const none = await fetchSetupReport(
      fakeCoss("live", { "GET /v1/sms/numbers": list([]) }).coss,
      { product: "sms" },
    );
    expect(none.products.sms?.status).toBe("needs_setup");
    expect(none.next).toContain("approved carrier registration");
    const pending = await fetchSetupReport(
      fakeCoss("live", { "GET /v1/sms/numbers": list([number("+14155550123", false)]) }).coss,
      { product: "sms" },
    );
    expect(pending.next).toContain("+14155550123 (pending, registration in_review)");
  });

  test("Verify in live: no number of its own says shared numbers may refuse", async () => {
    const settings = { sms_from: null, email_from: null };
    const report = await fetchSetupReport(
      fakeCoss("live", {
        "GET /v1/verify/settings": settings,
        "GET /v1/sms/numbers": list([number("+14155550123", true)]),
      }).coss,
      { product: "verify" },
    );
    expect(report.products.verify?.status).toBe("needs_setup");
    expect(report.next).toContain("shared_sender_unavailable");
    expect(report.next).toContain("+14155550123 can send");

    const unapproved = await fetchSetupReport(
      fakeCoss("live", {
        "GET /v1/verify/settings": { ...settings, sms_from: "+14155550123" },
        "GET /v1/sms/numbers": list([number("+14155550123", false)]),
      }).coss,
      { product: "verify" },
    );
    expect(unapproved.products.verify?.status).toBe("needs_setup");
    const ready = await fetchSetupReport(
      fakeCoss("live", {
        "GET /v1/verify/settings": { ...settings, sms_from: "+14155550123" },
        "GET /v1/sms/numbers": list([number("+14155550123", true)]),
      }).coss,
      { product: "verify" },
    );
    expect(ready.products.verify?.status).toBe("ready");
  });

  test("Scheduling names the first missing piece", async () => {
    const host = { id: "h1", name: "Grace", status: "active" };
    const eventType = { id: "et1", title: "Intro", status: "active" };
    const ask = (routes: Record<string, unknown>) =>
      fetchSetupReport(
        fakeCoss("sandbox", {
          "GET /v1/scheduling/hosts": list([]),
          "GET /v1/scheduling/event_types": list([]),
          ...routes,
        }).coss,
        { product: "scheduling" },
      );
    expect((await ask({})).next).toContain("Create a host");
    const noSchedule = await ask({
      "GET /v1/scheduling/hosts": list([host]),
      "GET /v1/scheduling/hosts/h1/schedules": list([]),
    });
    expect(noSchedule.next).toContain("Grace has no working hours");
    const noEventType = await ask({
      "GET /v1/scheduling/hosts": list([host]),
      "GET /v1/scheduling/hosts/h1/schedules": list([{ id: "s1" }]),
    });
    expect(noEventType.next).toContain("Create an event type");
    const ready = await ask({
      "GET /v1/scheduling/hosts": list([host]),
      "GET /v1/scheduling/hosts/h1/schedules": list([{ id: "s1" }]),
      "GET /v1/scheduling/event_types": list([eventType]),
    });
    expect(ready.products.scheduling?.status).toBe("ready");
    expect(ready.next).toContain("simulated");
    expect(ready.next).toContain("scheduling diagnose et1");
  });

  test("Forms, Hooks, inboxes and marketing say what's there and what's next", async () => {
    const ask = (product: SetupProduct, routes: Record<string, unknown>, mode = "sandbox") =>
      fetchSetupReport(fakeCoss(mode as "live" | "sandbox", routes).coss, { product });

    const noForms = await ask("forms", { "GET /v1/forms": list([]) });
    expect(noForms.next).toContain("Create a form");
    expect(noForms.next).toContain("[coss-test:spam]");
    const aForm = await ask("forms", {
      "GET /v1/forms": list([
        { id: "form_1", name: "Contact", endpoint: "https://f/form_1", enabled: true },
      ]),
    });
    expect(aForm.next).toContain("https://f/form_1");
    expect(aForm.next).toContain("spam is answered like a success");

    const noApps = await ask("hooks", { "GET /v1/hooks/applications": list([]) });
    expect(noApps.next).toContain("no applications");
    const application = { id: "happ_1", uid: "acme", name: "Acme" };
    const noEndpoints = await ask("hooks", {
      "GET /v1/hooks/applications": list([application]),
      "GET /v1/hooks/applications/happ_1/endpoints": list([]),
    });
    expect(noEndpoints.next).toContain("Acme has no endpoints");
    const hooksReady = await ask("hooks", {
      "GET /v1/hooks/applications": list([application]),
      "GET /v1/hooks/applications/happ_1/endpoints": list([
        { id: "hep_1", url: "https://e", enabled: true },
      ]),
    });
    expect(hooksReady.products.hooks?.status).toBe("ready");

    const receivesOnly = await ask(
      "inboxes",
      {
        "GET /v1/inboxes": list([
          { id: "inb_1", address: "a@x.inbound.coss.com", can_send: false },
        ]),
      },
      "live",
    );
    expect(receivesOnly.products.inboxes?.status).toBe("needs_setup");
    expect(receivesOnly.next).toContain("only receive");

    const noAddress = await ask("marketing", {
      "GET /v1/marketing_settings": { mailing_address: null },
      "GET /v1/contacts": list([]),
    });
    expect(noAddress.next).toContain("mailing_address");
    const noDomain = await ask(
      "marketing",
      {
        "GET /v1/marketing_settings": { mailing_address: "1 Main St" },
        "GET /v1/contacts": list([{ id: "c1" }]),
      },
      "live",
    );
    expect(noDomain.next).toContain("verified domain");
  });

  test("Sign reads as available; a failed read is only a warning", async () => {
    const report = await fetchSetupReport(fakeCoss("live").coss, { product: "sign" });
    expect(report.products.sign?.status).toBe("ready");
    expect(report.next).toContain("upload_sign_document");
    expect(report.warning).toContain("Couldn't read the Sign settings");
    expect(`${report.next} ${report.warning}`).not.toContain("deployment");
  });

  test("a failing read becomes a warning, never a thrown error", async () => {
    for (const product of SETUP_PRODUCTS) {
      const report = await fetchSetupReport(
        fakeCoss(product === "risk" || product === "email" ? "sandbox" : "live").coss,
        { product },
      );
      expect(report.next.length).toBeGreaterThan(0);
      if (product !== "risk" && product !== "email") {
        expect(report.warning).toContain("It broke.");
      }
    }
    const down = await fetchSetupReport(
      new Coss({
        apiKey: "coss_test_x",
        maxRetries: 0,
        fetch: async () => new Response("nope", { status: 500 }),
      }),
      { product: "forms" },
    );
    expect(down.mode).toBe("unknown");
    expect(down.products.forms?.status).toBe("unknown");
    expect(down.warning).toBeDefined();
  });

  test("a client without a product's resource still answers", async () => {
    const report = await fetchSetupReport(
      {
        environment: { get: async () => ({ data: { mode: "live" }, error: null }) },
        domains: { list: async () => ({ data: { data: [] }, error: null }) },
        webhookEndpoints: { list: async () => ({ data: { data: [] }, error: null }) },
      },
      { product: "forms" },
    );
    expect(report.products.forms?.status).toBe("unknown");
    expect(report.products_in_use).toBeUndefined();
  });
});
