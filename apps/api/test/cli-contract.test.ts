/**
 * Contract test: the published `coss-cli` (built dist, on the built `coss` SDK) against the real
 * app, in process: sign in with a key, send a simulated bounce and wait for it, forward the
 * environment's webhook events to a local receiver with `coss listen` and `coss trigger` test
 * events into it; add and verify a domain; keep templates as files (pull, edit, push, publish,
 * preview); and the other commands' realistic paths.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTestMessage, receiveFakeEmail } from "@coss/email";
import { runDueHookDeliveries } from "@coss/hooks";
import { testHookDeliveryDeps } from "@coss/hooks/testing";
import { queryLogs } from "@coss/logs";
import { buildTestPdfBase64 } from "@coss/sign/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { runDueWebhookDeliveries } from "@coss/webhooks";
import { TEST_SECRETS_KEYS, webhookReceiver } from "@coss/webhooks/testing";
import { Coss, verifyWebhook } from "coss";
import { type CliIo, CURSOR_FIELDS, run } from "coss-cli";
import { apiRequest, createTestApp, type TestApp, uniqueDomainName } from "./helpers.ts";

function toRequest(input: string | URL | Request, init?: RequestInit): Request {
  return input instanceof Request ? new Request(input, init) : new Request(String(input), init);
}

/** The CLI's io: the API is the in-process app, local URLs are real, output goes to strings. */
function cliIo(
  app: TestApp,
  opts: { answers?: string[]; stdin?: string; sleep?: () => Promise<void> } = {},
) {
  let stdout = "";
  let stderr = "";
  const controller = new AbortController();
  const answers = [...(opts.answers ?? [])];
  const io: CliIo = {
    env: { COSS_BASE_URL: "http://api.test" },
    stdout: {
      write: (chunk) => {
        stdout += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      },
    },
    stderr: {
      write: (text) => {
        stderr += text;
      },
    },
    stdinIsTTY: false,
    fetch: async (input, init) =>
      String(input instanceof Request ? input.url : input).startsWith("http://api.test")
        ? app.fetch(toRequest(input, init))
        : fetch(input, init),
    now: () => new Date(),
    sleep: async (ms, signal) => {
      if (opts.sleep) return opts.sleep();
      await new Promise((resolve) => setTimeout(resolve, Math.min(ms, 20)));
      void signal;
    },
    openBrowser: async () => false,
    watch: () => undefined,
    readStdin: async () => opts.stdin ?? "",
    prompt: async () => answers.shift() ?? "",
    hostname: () => "contract-test",
    cwd: mkdtempSync(join(tmpdir(), "coss-cli-contract-project-")),
    exec: async () => null,
    configDir: mkdtempSync(join(tmpdir(), "coss-cli-contract-")),
    signal: controller.signal,
  };
  return { io, controller, stdout: () => stdout, stderr: () => stderr };
}

describe("coss-cli against the API", () => {
  test("api --paginate knows the cursor of every list whose `after` isn't an id", () => {
    type Schema = {
      $ref?: string;
      properties?: Record<string, Schema>;
      items?: Schema;
      enum?: string[];
    };
    const doc = JSON.parse(readFileSync(join(import.meta.dir, "../openapi.json"), "utf8"));
    const schemas: Record<string, Schema> = doc.components.schemas;
    const resolve = (schema: Schema | undefined) =>
      schema?.$ref ? schemas[schema.$ref.split("/").at(-1) ?? ""] : schema;
    type Parameter = {
      name?: string;
      in?: string;
      description?: string;
      schema?: { description?: string };
    };
    type Get = {
      parameters?: Parameter[];
      responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
    };
    const expected: Record<string, string> = {};
    for (const operations of Object.values(doc.paths) as { get?: Get }[]) {
      const get = operations.get;
      const after = get?.parameters?.find((p) => p.name === "after" && p.in === "query");
      if (!get || !after) continue;
      const described = after.description ?? after.schema?.description ?? "";
      const field = /`(\w+)`/.exec(described)?.[1] ?? "id";
      if (field === "id") continue;
      const list = resolve(get.responses["200"]?.content?.["application/json"]?.schema);
      const item = resolve(list?.properties?.data?.items);
      const object = item?.properties?.object?.enum?.[0];
      if (object) expected[object] = field;
    }
    expect(expected).not.toEqual({});
    expect(CURSOR_FIELDS).toEqual(expected);
  });

  test("login --manual, whoami, and a simulated bounce followed to its outcome", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const cli = cliIo(app, { answers: [tenant.sandboxKey], sleep: () => dispatch() });

    expect(await run(["login", "--manual"], cli.io)).toBe(0);
    expect(cli.stdout()).toContain(`Signed in to ${tenant.organization.name} / Test Project / `);
    const config = JSON.parse(readFileSync(join(cli.io.configDir, "config.json"), "utf8"));
    expect(config.profiles.default).toMatchObject({
      api_key: tenant.sandboxKey,
      base_url: "http://api.test",
      environment: { id: tenant.development.id, mode: "sandbox" },
    });

    expect(await run(["whoami", "--json"], cli.io)).toBe(0);
    const whoami = JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");
    expect(whoami.environment).toMatchObject({ id: tenant.development.id, mode: "sandbox" });

    // `coss open` builds the dashboard's URL from the slugs the API reports.
    expect(await run(["open", "logs", "--json"], cli.io)).toBe(0);
    expect(JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}").url).toBe(
      `https://coss.com/${tenant.organization.slug}/${tenant.project.slug}/${tenant.development.slug}/developers/logs`,
    );

    expect(await run(["emails", "send", "--simulate", "bounced", "--wait", "--json"], cli.io)).toBe(
      0,
    );
    const sent = JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");
    expect(sent).toMatchObject({
      status: "sent",
      recipients: [{ address: "bounce@simulator.amazonses.com", status: "bounced" }],
    });
    expect(sent.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(["email.sent", "email.bounced"]),
    );
  });

  test("sms send --simulate reply --wait: the message's outcome and the simulator's reply", async () => {
    const tenant = await createTestTenant();
    const { app, dispatchSms } = createTestApp();
    const cli = cliIo(app, { sleep: () => dispatchSms() });
    cli.io.env.COSS_API_KEY = tenant.sandboxKey;

    expect(await run(["sms", "send", "--simulate", "reply", "--wait", "--json"], cli.io)).toBe(0);
    const sent = JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");
    expect(sent).toMatchObject({ status: "delivered", to: "+15005550008", sandbox: true });
    expect(sent.events.map((event: { type: string }) => event.type)).toEqual([
      "sms.sent",
      "sms.delivered",
    ]);
    expect(sent.replies).toEqual([
      expect.objectContaining({ from: "+15005550008", to: sent.from }),
    ]);

    expect(await run(["sms", "send", "--simulate", "invalid", "--wait"], cli.io)).toBe(0);
    expect(cli.stdout()).toContain("failed → +15005550001");
    expect(cli.stdout()).toContain("invalid_number:");
  });

  test("api: any endpoint with the profile's key, a body from stdin, and every page of a list", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const body = { from: "hello@acme.com", to: "ada@example.com", subject: "Hi", text: "Hi" };
    const cli = cliIo(app, { answers: [tenant.sandboxKey], stdin: JSON.stringify(body) });
    expect(await run(["login", "--manual"], cli.io)).toBe(0);
    const lines = () => cli.stdout().trim().split("\n");

    expect(await run(["api", "environment", "--json"], cli.io)).toBe(0);
    expect(JSON.parse(lines().at(-1) ?? "{}")).toMatchObject({ id: tenant.development.id });

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      expect(await run(["api", "emails", "--input", "-", "--json"], cli.io)).toBe(0);
      ids.push(JSON.parse(lines().at(-1) ?? "{}").id);
    }
    const before = lines().length;
    expect(await run(["api", "emails", "--paginate", "-F", "limit=2"], cli.io)).toBe(0);
    expect(
      lines()
        .slice(before)
        .map((line) => JSON.parse(line).id),
    ).toEqual(ids.toReversed());

    expect(await run(["api", "emails/email_nope", "--json"], cli.io)).toBe(1);
    expect(JSON.parse(lines().at(-1) ?? "{}").error).toMatchObject({ status: 404 });
  });

  test("hooks: an application with an endpoint, a message delivered to it, and its portal", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const receiver = webhookReceiver();
    const cli = cliIo(app, { answers: [tenant.sandboxKey] });
    const last = () => JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");
    try {
      expect(await run(["login", "--manual"], cli.io)).toBe(0);
      const example = JSON.stringify({ invoice_id: "in_1", amount: 4200 });
      expect(
        await run(["hooks", "event-types", "create", "invoice.paid", "--example", example], cli.io),
      ).toBe(0);
      expect(
        await run(["hooks", "apps", "create", "Acme", "--uid", "acme", "--json"], cli.io),
      ).toBe(0);
      expect(last()).toMatchObject({ object: "hook_application", uid: "acme" });
      expect(
        await run(
          [
            "hooks",
            "endpoints",
            "add",
            "acme",
            "--url",
            receiver.url,
            "--types",
            "invoice.paid",
            "--json",
          ],
          cli.io,
        ),
      ).toBe(0);
      const endpoint = last();
      expect(endpoint.secret).toStartWith("whsec_");

      // No payload: the event type's example is sent.
      expect(await run(["hooks", "send", "acme", "invoice.paid", "--json"], cli.io)).toBe(0);
      const message = last();
      expect(message.payload).toEqual({ invoice_id: "in_1", amount: 4200 });
      expect(
        await runDueHookDeliveries(
          { scope: { organizationIds: [tenant.organization.id] } },
          testHookDeliveryDeps(),
        ),
      ).toBe(1);
      const [request] = receiver.received;
      if (!request) throw new Error("nothing received");
      const headers = Object.fromEntries(request.headers.entries());
      expect(
        await verifyWebhook<Record<string, unknown>>(request.body, headers, endpoint.secret),
      ).toEqual({
        invoice_id: "in_1",
        amount: 4200,
      });

      expect(await run(["hooks", "deliveries", "acme", "--json"], cli.io)).toBe(0);
      const delivery = last();
      expect(delivery).toMatchObject({ status: "succeeded", message_id: message.id });
      expect(await run(["hooks", "attempts", "acme", delivery.id, "--json"], cli.io)).toBe(0);
      expect(last()).toMatchObject({ object: "hook_attempt", status_code: 200 });
      expect(await run(["hooks", "retry", "acme", delivery.id, "--json"], cli.io)).toBe(0);
      expect(last()).toMatchObject({ id: delivery.id, status: "pending" });
      expect(await run(["hooks", "endpoints", "list", "acme", "--json"], cli.io)).toBe(0);
      expect(last()).toMatchObject({ id: endpoint.id, url: receiver.url });
      expect(await run(["hooks", "portal", "acme", "--read-only"], cli.io)).toBe(0);
      expect(cli.stdout().trim().split("\n").at(-1)).toContain("#cossp_");
    } finally {
      receiver.stop();
    }
  });

  test("risk: list entries decide, sandbox fixtures score, and feedback resolves", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const cli = cliIo(app, { answers: [tenant.sandboxKey] });
    const last = () => JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");
    expect(await run(["login", "--manual"], cli.io)).toBe(0);

    expect(
      await run(
        ["risk", "lists", "add", "block", "domain", "evil.test", "--note", "spam", "--json"],
        cli.io,
      ),
    ).toBe(0);
    const entry = last();
    expect(entry).toMatchObject({ list: "block", type: "domain", value: "evil.test" });

    expect(
      await run(
        ["risk", "assess", "--event", "signup", "--email", "ada@evil.test", "--json"],
        cli.io,
      ),
    ).toBe(0);
    const blocked = last();
    expect(blocked.decision).toBe("block");
    expect(blocked.reasons.map((reason: { code: string }) => reason.code)).toContain(
      "list.blocked",
    );

    expect(
      await run(
        [
          "risk",
          "assess",
          "--event",
          "signup",
          "--email",
          "ada@disposable.test",
          "--ip",
          "192.0.2.1",
        ],
        cli.io,
      ),
    ).toBe(0);
    expect(cli.stdout()).toContain("email.disposable");
    expect(cli.stdout()).toContain("ip.tor");

    expect(
      await run(["risk", "feedback", blocked.id, "--outcome", "fraud", "--json"], cli.io),
    ).toBe(0);
    expect(last()).toMatchObject({ id: blocked.id, outcome: "fraud" });
    expect(await run(["risk", "assessments", "--decision", "block", "--json"], cli.io)).toBe(0);
    expect(cli.stdout()).toContain(blocked.id);

    expect(await run(["risk", "lists", "remove", entry.id, "--json"], cli.io)).toBe(0);
    expect(last()).toMatchObject({ id: entry.id, deleted: true });
    const before = cli.stdout().length;
    expect(await run(["risk", "lists", "list", "--json"], cli.io)).toBe(0);
    expect(cli.stdout().slice(before)).toBe("");
  });

  test("emails list, events and diagnose explain a bounce; inbox shows and follows received mail", async () => {
    const tenant = await createTestTenant();
    const testApp = createTestApp();
    const { app, dispatch, inbound } = testApp;
    if (!inbound) throw new Error("no inbound runtime");
    let onSleep: () => Promise<void> = () => dispatch();
    const cli = cliIo(app, { answers: [tenant.sandboxKey], sleep: () => onSleep() });
    const lines = () => cli.stdout().trim().split("\n");
    expect(await run(["login", "--manual"], cli.io)).toBe(0);

    expect(await run(["emails", "send", "--simulate", "bounced", "--wait", "--json"], cli.io)).toBe(
      0,
    );
    const sent = JSON.parse(lines().at(-1) ?? "{}");
    let before = lines().length;
    expect(await run(["emails", "list", "--recipient-status", "bounced", "--json"], cli.io)).toBe(
      0,
    );
    expect(
      lines()
        .slice(before)
        .map((line) => JSON.parse(line).id),
    ).toContain(sent.id);

    before = lines().length;
    expect(await run(["emails", "events", sent.id, "--json"], cli.io)).toBe(0);
    expect(
      lines()
        .slice(before)
        .map((line) => JSON.parse(line).type),
    ).toContain("email.bounced");

    expect(await run(["emails", "diagnose", sent.id, "--json"], cli.io)).toBe(0);
    expect(JSON.parse(lines().at(-1) ?? "{}")).toMatchObject({
      email_id: sent.id,
      verdict: "not_delivered",
      sandbox: true,
      recipients: [{ address: "bounce@simulator.amazonses.com", outcome: "bounced" }],
    });
    expect(await run(["emails", "diagnose", sent.id], cli.io)).toBe(0);
    expect(cli.stdout()).toContain("bounce@simulator.amazonses.com  bounced");

    // Received mail: one already there, one that arrives while `coss inbox` runs.
    const address = await app.request("/v1/received_emails/address", {
      headers: { Authorization: `Bearer ${tenant.sandboxKey}` },
    });
    const { domain } = (await address.json()) as { domain: string };
    const receive = async (subject: string) => {
      const raw = buildTestMessage({
        from: "Jane <jane@example.com>",
        to: [`support@${domain}`],
        subject,
        text: `Body of ${subject}`,
        html: "<p>HTML</p>",
        attachments: [],
      });
      const [outcome] = await receiveFakeEmail(
        { raw, mailFrom: "jane@example.com", recipients: [`support@${domain}`], subject },
        { store: inbound.store, managedDomain: inbound.managedDomain },
      );
      if (outcome?.kind !== "received") throw new Error(`not received: ${outcome?.kind}`);
      return outcome.receivedEmailId;
    };
    const earlier = await receive("Earlier");
    expect(await run(["inbox", "get", earlier], cli.io)).toBe(0);
    expect(cli.stdout()).toContain("Subject    Earlier");
    expect(cli.stdout()).toContain("Body of Earlier");

    let later = "";
    onSleep = async () => {
      if (!later) later = await receive("Later");
      else cli.controller.abort();
    };
    before = lines().length;
    expect(await run(["inbox", "--json"], cli.io)).toBe(130);
    const objects = lines()
      .slice(before)
      .map((line) => JSON.parse(line));
    expect(objects[0]).toMatchObject({ object: "inbound_address", domain });
    expect(objects.slice(1).map((object) => object.id)).toEqual([later]);
  });

  test("domains: add, verify --wait; templates: pull, edit, push --publish, preview", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const cli = cliIo(app, { answers: [tenant.liveKey] });
    expect(await run(["login", "--manual"], cli.io)).toBe(0);
    const last = () => JSON.parse(cli.stdout().trim().split("\n").at(-1) ?? "{}");

    const name = uniqueDomainName();
    expect(await run(["domains", "add", name, "--format", "bind"], cli.io)).toBe(0);
    expect(cli.stdout()).toContain(`; ${name}: the DNS records coss.com needs`);
    expect(cli.stdout()).toMatch(/\._domainkey\..+\t3600\tIN\tCNAME\t.+\.$/m);
    expect(await run(["domains", "verify", name, "--wait", "--json"], cli.io)).toBe(0);
    expect(last()).toMatchObject({ name, status: "verified", can_send: true });

    const created = await apiRequest(app, "POST", "/v1/email_templates", {
      key: tenant.liveKey,
      body: {
        name: "Welcome",
        alias: "welcome",
        variables: [{ name: "first_name", type: "string" }],
        sample_variables: { first_name: "Ada" },
        contents: [{ locale: "en", subject: "Welcome, {{first_name}}", text: "Hi {{first_name}}" }],
      },
    });
    expect(created.status).toBe(200);
    const dir = join(cli.io.configDir, "templates");
    expect(await run(["templates", "pull", "--dir", dir], cli.io)).toBe(0);
    expect(readFileSync(join(dir, "welcome", "en.txt"), "utf8")).toBe("Hi {{first_name}}");
    // Unchanged files save nothing; an edit is saved and published.
    expect(await run(["templates", "push", "--dir", dir], cli.io)).toBe(0);
    expect(cli.stdout()).toContain("welcome: unchanged");
    writeFileSync(join(dir, "welcome", "en.html"), "<p>Hello {{first_name}}</p>");
    expect(await run(["templates", "push", "--dir", dir, "--publish", "--json"], cli.io)).toBe(0);
    expect(last()).toMatchObject({ saved: true, revision: 2, published_version: 1 });

    expect(
      await run(["templates", "preview", "welcome", "--var", "first_name=Grace", "--json"], cli.io),
    ).toBe(0);
    expect(last()).toMatchObject({
      object: "email_template_render",
      version: null,
      subject: "Welcome, Grace",
      html: "<p>Hello Grace</p>",
      text: "Hi Grace",
    });
  });

  test("listen forwards the environment's events to a local server, signed, and logs them", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const receiver = webhookReceiver();
    const cli = cliIo(app, { answers: [tenant.sandboxKey] });
    try {
      expect(await run(["login", "--manual"], cli.io)).toBe(0);
      const started = new Date();
      const listening = run(
        ["listen", "--forward-to", receiver.url, "--events", "email.sent,email.delivered"],
        cli.io,
      );
      // Once the listener is open, send an email; its events reach the receiver.
      for (let i = 0; i < 200 && !cli.stderr().includes("Ready!"); i++) await Bun.sleep(10);
      const sent = await app.request("/v1/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tenant.sandboxKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "hello@acme.com",
          to: "ada@example.com",
          subject: "Hi",
          text: "Hi",
        }),
      });
      expect(sent.status).toBe(202);
      await dispatch();
      // Until the CLI has both answers: Ctrl-C mid-forward reports that forward as interrupted.
      const forwarded = () => cli.stdout().split("[200]").length - 1;
      for (let i = 0; i < 300 && forwarded() < 2; i++) await Bun.sleep(10);
      cli.controller.abort();
      expect(await listening).toBe(130);

      expect(receiver.received.map((r) => JSON.parse(r.body).type)).toEqual([
        "email.sent",
        "email.delivered",
      ]);
      const config = JSON.parse(readFileSync(join(cli.io.configDir, "config.json"), "utf8"));
      const secret: string = config.profiles.default.listen_secret;
      expect(cli.stderr()).toContain(secret);
      for (const request of receiver.received) {
        const event = await verifyWebhook(request.body, request.headers, secret);
        expect(request.headers.get("webhook-id")).toBe(event.id);
      }

      // Each forward is a webhook.forward log line; the listener is closed.
      const logs = await queryLogs({
        organizationId: tenant.organization.id,
        environmentId: tenant.development.id,
        from: new Date(started.getTime() - 60_000),
        to: new Date(Date.now() + 60_000),
        filters: { sources: ["webhook"] },
      });
      expect(logs.data.map((line) => line.type)).toEqual(["webhook.forward", "webhook.forward"]);
      expect(logs.data[0]?.status_code).toBe(200);
      const listenerId = String(logs.data[0]?.attributes.listener_id);
      const closed = await app.request(`/v1/webhook_listeners/${listenerId}/poll`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tenant.sandboxKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wait_ms: 0 }),
      });
      expect(closed.status).toBe(404);
    } finally {
      receiver.stop();
    }
  });

  test("trigger: a test event reaches coss listen's local server, signed, and an endpoint", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const receiver = webhookReceiver();
    const cli = cliIo(app, { answers: [tenant.sandboxKey] });
    try {
      expect(await run(["login", "--manual"], cli.io)).toBe(0);
      const created = await app.request("/v1/webhook_endpoints", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tenant.sandboxKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://hooks.example.com/coss",
          event_types: ["email.bounced"],
        }),
      });
      const endpoint = (await created.json()) as { id: string };

      const listening = run(
        ["listen", "--forward-to", receiver.url, "--events", "email.bounced"],
        cli.io,
      );
      for (let i = 0; i < 200 && !cli.stderr().includes("Ready!"); i++) await Bun.sleep(10);
      // A second terminal, on the same profile.
      const other = cliIo(app);
      other.io.configDir = cli.io.configDir;
      expect(
        await run(
          ["trigger", "email.bounced", "-F", "recipient=ada@example.com", "--json"],
          other.io,
        ),
      ).toBe(0);
      const sent = JSON.parse(other.stdout().trim());
      expect(sent).toMatchObject({ endpoints: 1, listeners: 1, event: { type: "email.bounced" } });

      for (let i = 0; i < 300 && receiver.received.length < 1; i++) await Bun.sleep(10);
      cli.controller.abort();
      expect(await listening).toBe(130);
      const [request] = receiver.received;
      const config = JSON.parse(readFileSync(join(cli.io.configDir, "config.json"), "utf8"));
      const event = await verifyWebhook(
        request?.body ?? "",
        request?.headers ?? new Headers(),
        config.profiles.default.listen_secret,
      );
      expect(event).toEqual(sent.event);
      expect(event).toMatchObject({ data: { recipient: "ada@example.com", sandbox: true } });

      // The endpoint's delivery, answered by "the server", then retried with the CLI.
      await runDueWebhookDeliveries(
        { scope: { organizationIds: [tenant.organization.id] } },
        { secretsKeys: TEST_SECRETS_KEYS, send: async () => ({ status: 200, body: "ok" }) },
      );
      const listed = cliIo(app);
      listed.io.configDir = cli.io.configDir;
      expect(await run(["webhooks", "list", "--json"], listed.io)).toBe(0);
      expect(JSON.parse(listed.stdout().trim())).toMatchObject({ id: endpoint.id });
      expect(
        await run(
          ["webhooks", "deliveries", endpoint.id, "--status", "succeeded", "--json"],
          listed.io,
        ),
      ).toBe(0);
      const delivery = JSON.parse(listed.stdout().trim().split("\n").at(-1) ?? "{}");
      expect(delivery).toMatchObject({ event_id: sent.event.id, status: "succeeded" });
      expect(await run(["webhooks", "retry", endpoint.id, delivery.id, "--json"], listed.io)).toBe(
        0,
      );
      expect(JSON.parse(listed.stdout().trim().split("\n").at(-1) ?? "{}")).toMatchObject({
        id: delivery.id,
        status: "pending",
      });
    } finally {
      receiver.stop();
    }
  });

  /** The JSON objects a `--json` command printed, one per line. */
  function lines(output: string): Record<string, never>[] {
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async function signedIn(app: TestApp, key: string) {
    const first = cliIo(app, { answers: [key] });
    expect(await run(["login", "--manual"], first.io)).toBe(0);
    return (argv: string[]) => {
      const cli = cliIo(app);
      cli.io.configDir = first.io.configDir;
      cli.io.cwd = first.io.cwd;
      return { cli, code: run(argv, cli.io) };
    };
  }

  test("verify: start, check and settings", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = await signedIn(app, tenant.sandboxKey);
    const started = coss(["verify", "start", "+15005550006", "--json"]);
    expect(await started.code).toBe(0);
    const [verification] = lines(started.cli.stdout());
    const wrong = coss(["verify", "check", "--to", "+15005550006", "--code", "123456"]);
    expect(await wrong.code).toBe(1);
    const right = coss(["verify", "check", "--id", String(verification?.id), "--code", "000000"]);
    expect(await right.code).toBe(0);
    expect(right.cli.stdout()).toContain("approved");
    const set = coss(["verify", "settings", "set", "--code-length", "8", "--json"]);
    expect(await set.code).toBe(0);
    expect(lines(set.cli.stdout())[0]).toMatchObject({ code_length: 8 });
    const get = coss(["verify", "settings", "get"]);
    expect(await get.code).toBe(0);
    expect(get.cli.stdout()).toContain("8 digits");
    expect(await coss(["verify", "list", "--status", "approved"]).code).toBe(0);
    expect(await coss(["verify", "get", String(verification?.id)]).code).toBe(0);
  });

  test("contacts and broadcasts: a draft from a file, tested and scheduled", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const client = new Coss({
      apiKey: tenant.sandboxKey,
      baseUrl: "http://api.test",
      fetch: (input, init) => Promise.resolve(app.fetch(toRequest(input, init))),
    });
    await client.email.marketingSettings.update({
      display_name: "Acme",
      mailing_address: "1 Main St, Springfield",
    });
    const audience = await client.email.audiences.create({ name: "Newsletter" });
    const coss = await signedIn(app, tenant.sandboxKey);
    const added = coss([
      "contacts",
      "add",
      "ada@example.com",
      "--audience",
      String(audience.data?.id),
      "--json",
    ]);
    expect(await added.code).toBe(0);
    expect(lines(added.cli.stdout())[0]).toMatchObject({ status: "subscribed" });
    const listed = coss(["contacts", "list", "--status", "subscribed"]);
    expect(await listed.code).toBe(0);
    expect(listed.cli.stdout()).toContain("ada@example.com");
    expect(await coss(["contacts", "get", "ada@example.com"]).code).toBe(0);

    const file = coss(["--help"]);
    writeFileSync(
      join(file.cli.io.cwd, "october.html"),
      `<p>Hello</p><a href="{{{unsubscribe_url}}}">Unsubscribe</a> {{{mailing_address}}}`,
    );
    const created = coss([
      "broadcasts",
      "create",
      "--name",
      "October",
      "--from",
      "news@acme.com",
      "--subject",
      "News",
      "--html",
      "october.html",
      "--audience",
      String(audience.data?.id),
      "--json",
    ]);
    expect(await created.code).toBe(0);
    const [broadcast] = lines(created.cli.stdout());
    expect(broadcast).toMatchObject({ status: "draft" });
    const id = String(broadcast?.id);
    expect(await coss(["broadcasts", "test", id, "--to", "me@example.com"]).code).toBe(0);
    const at = new Date(Date.now() + 3_600_000).toISOString();
    const sent = coss(["broadcasts", "send", id, "--at", at, "--json"]);
    expect(await sent.code).toBe(0);
    expect(lines(sent.cli.stdout())[0]).toMatchObject({ status: "scheduled" });
    expect(await coss(["broadcasts", "list", "--status", "scheduled"]).code).toBe(0);
    expect(await coss(["broadcasts", "get", id]).code).toBe(0);
    expect(await coss(["broadcasts", "cancel", id]).code).toBe(0);
    expect(await coss(["contacts", "remove", "ada@example.com"]).code).toBe(0);
  });

  test("sign: upload, a draft, sending it and the audit trail", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    const coss = await signedIn(app, tenant.sandboxKey);
    const file = coss(["--help"]);
    writeFileSync(
      join(file.cli.io.cwd, "nda.pdf"),
      Buffer.from(await buildTestPdfBase64(), "base64"),
    );
    const uploaded = coss(["sign", "upload", "nda.pdf", "--json"]);
    expect(await uploaded.code).toBe(0);
    const [document] = lines(uploaded.cli.stdout());
    const created = coss([
      "sign",
      "create",
      "--title",
      "NDA",
      "--document",
      String(document?.id),
      "--signer",
      "Ada Lovelace <ada@example.com>",
      "--json",
    ]);
    expect(await created.code).toBe(0);
    const [request] = lines(created.cli.stdout());
    expect(request).toMatchObject({ status: "draft" });
    const id = String(request?.id);
    const sent = coss(["sign", "send", id]);
    expect(await sent.code).toBe(0);
    expect(sent.cli.stdout()).toContain("sent");
    expect(await coss(["sign", "list", "--status", "sent"]).code).toBe(0);
    expect(await coss(["sign", "get", id]).code).toBe(0);
    // Invited moments ago: nobody is due a reminder yet.
    const remind = coss(["sign", "remind", id]);
    expect(await remind.code).toBe(1);
    expect(remind.cli.stderr()).toContain("Couldn't send the reminder");
    const audit = coss(["sign", "audit", id, "--json"]);
    expect(await audit.code).toBe(0);
    expect(lines(audit.cli.stdout()).length).toBeGreaterThan(0);
    expect(await coss(["sign", "templates"]).code).toBe(0);
    expect(await coss(["sign", "cancel", id]).code).toBe(0);
  });

  test("sms, forms and scheduling: reads on what the SDK set up", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = createTestApp();
    const client = new Coss({
      apiKey: tenant.sandboxKey,
      baseUrl: "http://api.test",
      fetch: (input, init) => Promise.resolve(app.fetch(toRequest(input, init))),
    });
    const coss = await signedIn(app, tenant.sandboxKey);

    const message = await client.sms.send({
      from: "+14155550100",
      to: "+15005550006",
      body: "Hello",
    });
    await dispatch();
    const got = coss(["sms", "get", String(message.data?.id)]);
    expect(await got.code).toBe(0);
    expect(got.cli.stdout()).toContain("Hello");
    expect(await coss(["sms", "list", "--to", "+15005550006"]).code).toBe(0);
    expect(await coss(["sms", "received"]).code).toBe(0);
    expect(await coss(["sms", "numbers"]).code).toBe(0);
    const added = coss(["sms", "suppressions", "add", "+15005550007", "--json"]);
    expect(await added.code).toBe(0);
    expect(await coss(["sms", "suppressions", "list"]).code).toBe(0);
    const [suppression] = lines(added.cli.stdout());
    expect(await coss(["sms", "suppressions", "remove", String(suppression?.id)]).code).toBe(0);

    const form = coss(["forms", "create", "Contact", "--json"]);
    expect(await form.code).toBe(0);
    const [created] = lines(form.cli.stdout());
    expect(await coss(["forms", "get", String(created?.id)]).code).toBe(0);

    const host = await client.scheduling.hosts.create({
      uid: "ada",
      name: "Ada",
      time_zone: "UTC",
    });
    await client.scheduling.schedules.create("ada", {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" }],
    });
    await client.scheduling.eventTypes.create({
      uid: "intro",
      title: "Intro",
      duration_minutes: 30,
      hosts: [{ host: String(host.data?.id) }],
    });
    expect(await coss(["scheduling", "event-types"]).code).toBe(0);
    const start = new Date(Date.now() + 86_400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const slots = coss(["scheduling", "slots", "intro", "--start", start, "--end", end, "--json"]);
    expect(await slots.code).toBe(0);
    const [slot] = lines(slots.cli.stdout());
    const booking = await client.scheduling.bookings.create({
      event_type: "intro",
      start: String(slot?.start),
      attendee: { name: "Bo", email: "bo@example.com", time_zone: "UTC" },
    });
    const id = String(booking.data?.id);
    const shown = coss(["scheduling", "booking", id]);
    expect(await shown.code).toBe(0);
    expect(shown.cli.stdout()).toContain("confirmed");
    expect(await coss(["scheduling", "calendars", "ada"]).code).toBe(0);
    await client.scheduling.hosts.create({ uid: "grace", name: "Grace", time_zone: "UTC" });
    await client.scheduling.schedules.create("grace", {
      rules: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "24:00" }],
    });
    const candidates = coss(["scheduling", "candidates", id, "--json"]);
    expect(await candidates.code).toBe(0);
    expect(lines(candidates.cli.stdout())[0]).toMatchObject({ uid: "grace", member: false });
    expect(await coss(["scheduling", "reassign", id]).code).toBe(2);
    expect(await coss(["scheduling", "reassign", id, "--to", "grace"]).code).toBe(1);
    const moved = coss([
      "scheduling",
      "reassign",
      id,
      "--to",
      "grace",
      "--any-host",
      "--reason",
      "out_of_office",
      "--json",
    ]);
    expect(await moved.code).toBe(0);
    expect(await coss(["scheduling", "ooo", "--host", "grace"]).code).toBe(0);
    expect(await coss(["scheduling", "cancel", id]).code).toBe(0);
  });
});
