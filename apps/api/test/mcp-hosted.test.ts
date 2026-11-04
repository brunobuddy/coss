/**
 * `POST /mcp` end to end: the built `coss-mcp/http` handler in the real app, with a real MCP client
 * speaking Streamable HTTP to `app.fetch`. The tools reach the API the way production does.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db, pool } from "@coss/db";
import { contact } from "@coss/db/schema";
import { uniqueSuffix } from "@coss/db/testing";
import { memoryLogWriter } from "@coss/logs/testing";
import { cachedOverrides, clientIpResolver, setRateLimitOverride } from "@coss/ratelimit";
import { memoryLimiter } from "@coss/ratelimit/testing";
import { createEnvironmentApiKey } from "@coss/tenancy";
import { suspendOrganization } from "@coss/tenancy/admin";
import { createTestTenant, createTestUser, type TestTenant } from "@coss/tenancy/testing";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { SETUP_PRODUCTS } from "coss";
import { createHostedMcp } from "coss-mcp/http";
import {
  apiRequest,
  createTestApp,
  setKeyPermissions,
  type TestApp,
  waitForLogLines,
} from "./helpers.ts";

const MCP_URL = "http://api.test/mcp";
/** What a Streamable HTTP client sends. */
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function hostedApp(opts: Parameters<typeof createTestApp>[0] = {}) {
  const docsRequests: { url: string; redirect?: RequestRedirect }[] = [];
  const failures: string[] = [];
  const testApp = createTestApp({
    ...opts,
    mcp:
      opts.mcp ??
      createHostedMcp({
        apiBaseUrl: "http://api.test",
        onFailure: (name) => failures.push(name),
        docs: {
          fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            docsRequests.push({ url: String(input), redirect: init?.redirect });
            return String(input).includes("/moved.md")
              ? new Response(null, {
                  status: 302,
                  headers: { Location: "http://169.254.169.254/" },
                })
              : new Response("# Webhooks\n\nVerify the signature.");
          }) as typeof fetch,
        },
      }),
  });
  return { ...testApp, docsRequests, failures };
}

async function connect(app: TestApp, apiKey: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: (input, init) => Promise.resolve(app.fetch(new Request(String(input), init))),
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const client = new Client({ name: "hosted-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
  // biome-ignore lint/suspicious/noExplicitAny: assertions read the tool's JSON.
): Promise<{ isError: boolean; data: any }> {
  const result = await client.callTool({ name, arguments: args });
  const [content] = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, data: JSON.parse(content?.text ?? "null") };
}

function post(
  app: TestApp,
  key: string | null,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/mcp", {
    method: "POST",
    headers: { ...MCP_HEADERS, ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw", version: "0" },
  },
};
const TOOLS_LIST = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

/** A JSON-RPC error with no result, and the HTTP status it came with. */
async function protocolErrorOf(response: Response) {
  const body = (await response.json()) as {
    jsonrpc: string;
    id: unknown;
    error: {
      code: number;
      message: string;
      data?: { type: string; code: string; request_id: string };
    };
  };
  expect(body.jsonrpc).toBe("2.0");
  expect(body.error.code).toBeLessThan(0);
  expect(body).not.toHaveProperty("result");
  return body;
}

async function sessionIdOf(response: Response): Promise<string | null> {
  return response.headers.get("mcp-session-id");
}

describe("the hosted MCP server", () => {
  test("initialize, tools/list and a tools/call through the API", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);

    expect(client.getServerVersion()?.name).toBe("coss");
    expect(client.getInstructions()).toContain("sandbox (coss_test_) key");

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("send_email");

    const sent = await callTool(client, "send_email", {
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com"],
      subject: "Welcome",
      text: "Hi",
    });
    expect(sent.isError).toBe(false);
    expect(sent.data.email.status).toBe("queued");
    await dispatch();

    const found = await callTool(client, "find_emails", { to: "ada@example.com" });
    expect(found.data.emails).toEqual([expect.objectContaining({ id: sent.data.email.id })]);

    // The tool went through the public API: it is that API's row, visible with that key.
    const read = await apiRequest(app, "GET", `/v1/emails/${sent.data.email.id}`, {
      key: tenant.sandboxKey,
    });
    expect(read.status).toBe(200);
  });

  test("2025-era clients get one JSON body and no session", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();

    const initialized = await post(app, tenant.sandboxKey, INITIALIZE);
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("content-type")).toContain("application/json");
    expect(await sessionIdOf(initialized)).toBeNull();
    const init = (await initialized.json()) as { id: number; result: { protocolVersion: string } };
    expect(init.id).toBe(1);
    expect(init.result.protocolVersion).toBe("2025-06-18");

    const notified = await post(
      app,
      tenant.sandboxKey,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "Mcp-Protocol-Version": "2025-06-18" },
    );
    expect(notified.status).toBe(202);

    const listed = await post(app, tenant.sandboxKey, TOOLS_LIST, {
      "Mcp-Protocol-Version": "2025-06-18",
    });
    expect(listed.status).toBe(200);
    const { result } = (await listed.json()) as { result: { tools: { name: string }[] } };
    expect(result.tools.length).toBeGreaterThan(50);
  });

  test("2026-07-28 clients are served per request, in the same one JSON body", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "raw", version: "0" },
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    const listed = await post(
      app,
      tenant.sandboxKey,
      { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: meta } },
      { "Mcp-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list" },
    );
    expect(listed.status).toBe(200);
    expect(listed.headers.get("content-type")).toContain("application/json");
    const { id, result } = (await listed.json()) as {
      id: number;
      result: { tools: { name: string }[] };
    };
    expect(id).toBe(4);
    expect(result.tools.map((tool) => tool.name)).toContain("get_setup");
    expect(result.tools.map((tool) => tool.name)).not.toContain("upload_sign_document");

    const called = await post(
      app,
      tenant.sandboxKey,
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_setup", arguments: {}, _meta: meta },
      },
      { "Mcp-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": "get_setup" },
    );
    expect(called.status).toBe(200);
    const answer = (await called.json()) as { result: { isError?: boolean } };
    expect(answer.result.isError).toBeFalsy();
  });

  test("it answers with the app's request id, security headers and rate limit headers", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const response = await post(app, tenant.sandboxKey, INITIALIZE);
    expect(response.headers.get("x-request-id")).toStartWith("req_");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("ratelimit-limit")).toBe("30");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("authentication", () => {
  test("no key: 401 in JSON-RPC, and nothing is served", async () => {
    const { app } = hostedApp();
    const response = await post(app, null, TOOLS_LIST);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    const body = await protocolErrorOf(response);
    expect(body.id).toBeNull();
    expect(body.error.data).toMatchObject({
      type: "authentication_error",
      code: "missing_api_key",
    });
    expect(body.error.data?.request_id).toStartWith("req_");
  });

  test("a bad key: 401 invalid_api_key, never echoed", async () => {
    const { app } = hostedApp();
    const bad = "coss_test_not_a_real_key_0123456789";
    const response = await post(app, bad, TOOLS_LIST);
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).toContain("invalid_api_key");
    expect(text).not.toContain(bad);
  });

  test("a key in the URL is not a key", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    for (const query of [`api_key=${tenant.sandboxKey}`, `token=${tenant.sandboxKey}`]) {
      const response = await app.request(`/mcp?${query}`, {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify(TOOLS_LIST),
      });
      expect(response.status).toBe(401);
    }
  });

  test("a revoked key stops working at once", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const { key } = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "to revoke",
      userId: tenant.owner.id,
      permissions: "full",
    });
    expect((await post(app, key, TOOLS_LIST)).status).toBe(200);
    expect((await apiRequest(app, "DELETE", "/v1/api_key", { key })).status).toBe(200);
    const response = await post(app, key, TOOLS_LIST);
    expect(response.status).toBe(401);
    expect((await protocolErrorOf(response)).error.data?.code).toBe("invalid_api_key");
  });

  test("a suspended organization's keys: 403 organization_suspended", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const admin = await createTestUser();
    await suspendOrganization({
      organizationId: tenant.organization.id,
      reason: "Abuse report",
      actor: { userId: admin.id, email: admin.email },
    });
    const response = await post(app, tenant.sandboxKey, TOOLS_LIST);
    expect(response.status).toBe(403);
    expect((await protocolErrorOf(response)).error.data).toMatchObject({
      type: "permission_error",
      code: "organization_suspended",
    });
  });

  test("a restricted key connects, and its tools answer the API's 403", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const { id, key } = await createEnvironmentApiKey({
      organizationId: tenant.organization.id,
      environmentId: tenant.development.id,
      name: "reads emails",
      userId: tenant.owner.id,
      permissions: "full",
    });
    await setKeyPermissions(id, { email: ["read"] });
    const client = await connect(app, key);
    const listed = await callTool(client, "find_emails");
    expect(listed.isError).toBe(false);

    const refused = await callTool(client, "send_email", {
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com"],
      subject: "No",
      text: "No",
    });
    expect(refused.isError).toBe(true);
    expect(refused.data.error).toMatchObject({ status: 403, code: "insufficient_permissions" });
    // The API's own hint.
    expect(refused.data.hint).toContain("Keys keep the permissions");
  });

  test("sandbox and live keys see their own environment only", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const sandbox = await connect(app, tenant.sandboxKey);
    const live = await connect(app, tenant.liveKey);
    expect(live.getInstructions()).toContain("live (coss_live_) key");

    const sent = await callTool(sandbox, "send_email", {
      from: "Acme <hello@acme.com>",
      to: ["grace@example.com"],
      subject: "Sandbox only",
      text: "Hi",
    });
    const id = sent.data.email.id as string;

    expect((await callTool(sandbox, "get_email", { id })).isError).toBe(false);
    const hidden = await callTool(live, "get_email", { id });
    expect(hidden.isError).toBe(true);
    expect(hidden.data.error.status).toBe(404);
    const found = await callTool(live, "find_emails", { to: "grace@example.com" });
    expect(found.data.emails ?? []).toEqual([]);
  });

  test("two callers on one server never get each other's key", async () => {
    const [a, b] = [await createTestTenant(), await createTestTenant()];
    const { app } = hostedApp();
    const [clientA, clientB] = [await connect(app, a.sandboxKey), await connect(app, b.sandboxKey)];
    const email = (subject: string) => ({
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com"],
      subject,
      text: "Hi",
    });
    const idA = (await callTool(clientA, "send_email", email("A"))).data.email.id as string;
    const idB = (await callTool(clientB, "send_email", email("B"))).data.email.id as string;

    const answers = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const own = i % 2 === 0;
        const client = i % 4 < 2 ? clientA : clientB;
        const mine = client === clientA ? idA : idB;
        const theirs = client === clientA ? idB : idA;
        return { own, answer: await callTool(client, "get_email", { id: own ? mine : theirs }) };
      }),
    );
    for (const { own, answer } of answers) expect(answer.isError).toBe(!own);
  });
});

describe("what a caller can't do", () => {
  test("no tool touches files, and the instructions say so", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).not.toContain("upload_sign_document");
    expect(names).toContain("create_webhook_endpoint");
    expect(JSON.stringify(tools)).not.toContain("project env file");
    expect(client.getInstructions()).not.toContain("upload_sign_document");
    expect(client.getInstructions()).not.toContain("project env file");
  });

  test("a new webhook endpoint's secret comes back, and goes nowhere else", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const created = await callTool(client, "create_webhook_endpoint", {
      url: "https://example.com/hooks",
    });
    expect(created.isError).toBe(false);
    expect(created.data.secret).toStartWith("whsec_");
    expect(created.data).not.toHaveProperty("env_file");
    expect(created.data).not.toHaveProperty("env_error");
  });

  test("the docs tools read only the fixed docs origin, whatever the caller asks", async () => {
    const tenant = await createTestTenant();
    const { app, docsRequests } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);

    const page = await client.callTool({
      name: "read_docs",
      arguments: { page: "/docs/webhooks" },
    });
    expect(page.isError).toBeFalsy();
    expect(docsRequests.at(-1)?.url).toBe("https://coss.com/docs/webhooks.md");

    const before = docsRequests.length;
    for (const page of [
      "http://169.254.169.254/latest/meta-data",
      "https://evil.example/docs/webhooks",
      "//evil.example/docs/webhooks",
      "/docs/../../etc/passwd",
      "file:///etc/passwd",
    ]) {
      const refused = await client.callTool({ name: "read_docs", arguments: { page } });
      expect(refused.isError).toBe(true);
    }
    expect(docsRequests.length).toBe(before);
  });

  test("a redirect from the docs is never followed", async () => {
    const tenant = await createTestTenant();
    const { app, docsRequests } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const moved = await client.callTool({ name: "read_docs", arguments: { page: "/docs/moved" } });
    expect(moved.isError).toBe(true);
    expect(docsRequests.at(-1)?.redirect).toBe("manual");
  });

  test("request headers and arguments can't point the server at another API", async () => {
    const tenant = await createTestTenant();
    const seen: string[] = [];
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    const { app } = hostedApp({ mcp });
    const original = app.fetch.bind(app);
    app.fetch = ((request: Request, ...rest: []) => {
      seen.push(request.url);
      return original(request, ...rest);
    }) as typeof app.fetch;

    const client = new Client({ name: "spoof", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: (input, init) => Promise.resolve(app.fetch(new Request(String(input), init))),
        requestInit: {
          headers: {
            Authorization: `Bearer ${tenant.sandboxKey}`,
            Host: "evil.example",
            "X-Forwarded-Host": "evil.example",
            "Coss-Base-Url": "http://evil.example",
          },
        },
      }),
    );
    await callTool(client, "get_email", { id: "../../../../health" });
    await callTool(client, "get_email", { id: "http://evil.example/" });
    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) expect(new URL(url).host).not.toContain("evil");
  });
});

describe("the protocol", () => {
  test.each(["GET", "DELETE", "PUT", "PATCH", "OPTIONS"])("%s: 405, POST only", async (method) => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const response = await app.request("/mcp", {
      method,
      headers: { Authorization: `Bearer ${tenant.sandboxKey}`, Accept: "text/event-stream" },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    await protocolErrorOf(response);
  });

  test("a browser's request is refused before authentication, with no CORS headers", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp({ corsOrigins: ["https://coss.com"] });
    for (const origin of [
      "https://evil.example",
      "https://coss.com",
      "http://localhost:3000",
      "null",
    ]) {
      const response = await post(app, tenant.sandboxKey, TOOLS_LIST, { Origin: origin });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
      await protocolErrorOf(response);
    }
    const preflight = await app.request("/mcp", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    // Without a key, too: refused as a browser, not as a missing key.
    const anonymous = await post(app, null, TOOLS_LIST, { Origin: "https://evil.example" });
    expect(anonymous.status).toBe(403);
  });

  test("cookies are not credentials", async () => {
    const { app } = hostedApp();
    const response = await post(app, null, TOOLS_LIST, {
      Cookie: "__Secure-better-auth.session_token=abc",
    });
    expect(response.status).toBe(401);
  });

  test("an oversized body: 413, also without a Content-Length", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const big = JSON.stringify({ ...TOOLS_LIST, params: { pad: "x".repeat(2 * 1024 * 1024) } });

    const declared = await post(app, tenant.sandboxKey, big, {
      "Content-Length": String(big.length),
    });
    expect(declared.status).toBe(413);
    await protocolErrorOf(declared);

    const streamed = await app.request("/mcp", {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${tenant.sandboxKey}` },
      body: new Blob([big]).stream(),
    });
    expect(streamed.status).toBe(413);

    // An unauthenticated one doesn't get that far.
    expect((await post(app, null, big)).status).toBe(401);
  });

  test("malformed requests answer in JSON-RPC", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();

    const notJson = await post(app, tenant.sandboxKey, "{nope");
    expect(notJson.status).toBe(400);
    expect((await protocolErrorOf(notJson)).error.code).toBe(-32700);

    for (const body of ["null", "1", '"text"', "{}", '{"jsonrpc":"2.0"}']) {
      const odd = await post(app, tenant.sandboxKey, body);
      expect(odd.status).toBeGreaterThanOrEqual(400);
      expect(odd.status).toBeLessThan(500);
      await protocolErrorOf(odd);
    }

    const batch = await post(app, tenant.sandboxKey, [TOOLS_LIST, TOOLS_LIST]);
    expect(batch.status).toBe(400);
    expect((await protocolErrorOf(batch)).error.code).toBe(-32600);

    const text = await post(app, tenant.sandboxKey, JSON.stringify(TOOLS_LIST), {
      "Content-Type": "text/plain",
    });
    expect(text.status).toBe(415);
    await protocolErrorOf(text);
  });

  test("subscription streams are refused: nothing outlives a request", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const response = await post(
      app,
      tenant.sandboxKey,
      {
        jsonrpc: "2.0",
        id: 9,
        method: "subscriptions/listen",
        params: {
          filter: { toolsListChanged: true },
          notifications: { toolsListChanged: true },
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "raw", version: "0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      },
      { "Mcp-Protocol-Version": "2026-07-28", "Mcp-Method": "subscriptions/listen" },
    );
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
    const body = await protocolErrorOf(response);
    expect(body.error.message).toBe("Subscription limit reached");
  });

  test("the OpenAPI document doesn't list it", async () => {
    const { app } = hostedApp();
    const document = (await (await app.request("/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths).some((path) => path.includes("mcp"))).toBe(false);
  });

  test("without `mcp`, /mcp doesn't exist", async () => {
    const tenant = await createTestTenant();
    const { app } = createTestApp();
    expect((await post(app, tenant.sandboxKey, TOOLS_LIST)).status).toBe(404);
  });
});

describe("limits and logs", () => {
  async function limited(tenant: TestTenant, limit: number) {
    await setRateLimitOverride({
      organizationId: tenant.organization.id,
      bucket: "api.mcp",
      rule: { limit, periodMs: 60_000 },
    });
    return hostedApp({ rateLimiter: memoryLimiter({ overrides: cachedOverrides() }) });
  }

  test("api.mcp limits per key, and its 429 is JSON-RPC with Retry-After", async () => {
    const tenant = await createTestTenant();
    const { app } = await limited(tenant, 2);
    await post(app, tenant.sandboxKey, TOOLS_LIST);
    await post(app, tenant.sandboxKey, TOOLS_LIST);
    const response = await post(app, tenant.sandboxKey, TOOLS_LIST);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect((await protocolErrorOf(response)).error.data).toMatchObject({
      type: "rate_limit_error",
      code: "rate_limited",
    });
    // Another key has its own bucket.
    expect((await post(app, tenant.liveKey, TOOLS_LIST)).status).toBe(200);
  });

  test("bad keys spend the client address's failure bucket like /v1", async () => {
    const { app } = hostedApp({
      rateLimiter: memoryLimiter(),
      clientIp: clientIpResolver({ header: "x-test-ip" }),
    });
    const fromAddress = { "X-Test-Ip": "203.0.113.77" };
    for (let i = 0; i < 30; i++) {
      expect((await post(app, `coss_test_bad_${i}`, TOOLS_LIST, fromAddress)).status).toBe(401);
    }
    const blocked = await post(app, "coss_test_bad_last", TOOLS_LIST, fromAddress);
    expect(blocked.status).toBe(429);
    expect((await protocolErrorOf(blocked)).error.data?.code).toBe(
      "too_many_failed_authentications",
    );
    // /v1 shares that bucket.
    const v1 = await app.request("/v1/emails", {
      headers: { Authorization: "Bearer coss_test_bad", ...fromAddress },
    });
    expect(v1.status).toBe(429);
  });

  test("a tool's API call is attributed to the caller's address, not a header it can send", async () => {
    const tenant = await createTestTenant();
    const addresses: (string | null)[] = [];
    const clientIp = clientIpResolver({ header: "x-test-ip" });
    const limiter = memoryLimiter();
    const { app } = hostedApp({
      clientIp,
      rateLimiter: {
        ...limiter,
        consume: (request) => {
          if (request.buckets[0] === "api.authentication.ip") addresses.push(request.subject);
          return limiter.consume(request);
        },
      },
    });
    const response = await post(
      app,
      tenant.sandboxKey,
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_setup", arguments: {} } },
      { "X-Test-Ip": "203.0.113.5", "Mcp-Protocol-Version": "2025-06-18" },
    );
    expect(response.status).toBe(200);
    expect(addresses.length).toBeGreaterThan(1);
    expect(new Set(addresses)).toEqual(new Set(["203.0.113.5"]));
  });

  test("a tool's API calls spend their own buckets", async () => {
    const tenant = await createTestTenant();
    await setRateLimitOverride({
      organizationId: tenant.organization.id,
      bucket: "api.send",
      rule: { limit: 1, periodMs: 60_000 },
    });
    const { app } = hostedApp({ rateLimiter: memoryLimiter({ overrides: cachedOverrides() }) });
    const client = await connect(app, tenant.sandboxKey);
    const email = {
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com"],
      subject: "Hi",
      text: "Hi",
    };
    expect((await callTool(client, "send_email", email)).isError).toBe(false);
    const refused = await callTool(client, "send_email", email);
    expect(refused.isError).toBe(true);
    expect(refused.data.error).toMatchObject({ status: 429, code: "rate_limited" });
  });

  test("the environment's log has the API calls, without the key or the /mcp request", async () => {
    const tenant = await createTestTenant();
    const logWriter = memoryLogWriter();
    const lines = logWriter.entries;
    const { app } = hostedApp({ logWriter });
    const client = await connect(app, tenant.sandboxKey);
    await callTool(client, "find_emails");
    await waitForLogLines(logWriter, 1);
    const logged = JSON.stringify(lines);
    expect(logged).toContain("/v1/emails");
    expect(logged).not.toContain('/mcp"');
    expect(logged).not.toContain(tenant.sandboxKey);
  });
});

describe("tools, prompts and resources that came later", () => {
  const LOCAL_ONLY = /upload_sign_document|COSS_API_KEY|COSS_BASE_URL|\.env\b|env file/;

  test("coss://docs/index reads only the fixed docs origin, and never follows a redirect", async () => {
    const tenant = await createTestTenant();
    const { app, docsRequests } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri).sort()).toEqual([
      "coss://docs/index",
      "coss://setup",
    ]);

    const index = await client.readResource({ uri: "coss://docs/index" });
    expect(index.contents[0]).toMatchObject({ mimeType: "text/markdown" });
    expect(docsRequests.at(-1)).toEqual({ url: "https://coss.com/llms.txt", redirect: "manual" });
  });

  test("coss://setup answers for the key's environment, in hosted terms", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const { contents } = await client.readResource({ uri: "coss://setup" });
    const text = (contents[0] as { text: string }).text;
    expect(JSON.parse(text).mode).toBe("sandbox");
    expect(text).not.toMatch(LOCAL_ONLY);
  });

  test("no prompt points at something the hosted server doesn't have", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      const args = Object.fromEntries(
        (prompt.arguments ?? []).filter((arg) => arg.required).map((arg) => [arg.name, "sign"]),
      );
      const { messages } = await client.getPrompt({ name: prompt.name, arguments: args });
      expect(JSON.stringify(messages)).not.toMatch(LOCAL_ONLY);
    }
  });

  test("get_setup never names a tool the hosted server doesn't have, for any product", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    for (const key of [tenant.sandboxKey, tenant.liveKey]) {
      const client = await connect(app, key);
      for (const product of SETUP_PRODUCTS) {
        const { isError, data } = await callTool(client, "get_setup", { product });
        expect(isError).toBe(false);
        expect(JSON.stringify(data)).not.toMatch(LOCAL_ONLY);
      }
      const sign = await callTool(client, "get_setup", { product: "sign" });
      expect(sign.data.next).toContain("Upload a PDF (with the API or an SDK, or");
    }
  });

  test("the instructions and every tool read correctly, and say nothing of Sign being off", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const instructions = client.getInstructions() ?? "";
    const { tools } = await client.listTools();
    for (const text of [instructions, JSON.stringify(tools)]) {
      expect(text).not.toMatch(LOCAL_ONLY);
      expect(text).not.toMatch(/sign_unavailable|Sign isn't on/);
    }
    expect(instructions).toContain("upload the PDF with the API or an SDK");
    // The new families are all here; only the file tool isn't.
    const names = tools.map((tool) => tool.name);
    for (const name of [
      "api_get",
      "diagnose_email",
      "diagnose_sms",
      "diagnose_verification",
      "diagnose_sign_request",
      "diagnose_form_submission",
      "diagnose_hook_delivery",
      "diagnose_scheduling_slots",
      "create_sign_request",
    ]) {
      expect(names).toContain(name);
    }
  });

  test("diagnose tools work through the API, and hosted answers name no local config", async () => {
    const tenant = await createTestTenant();
    const { app, dispatch } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const sent = await callTool(client, "send_email", {
      from: "Acme <hello@acme.com>",
      to: ["ada@example.com"],
      subject: "Diagnose me",
      text: "Hi",
    });
    await dispatch();
    const diagnosis = await callTool(client, "diagnose_email", { email_id: sent.data.email.id });
    expect(diagnosis.isError).toBe(false);
    expect(diagnosis.data.verdict).toBe("delivered");

    const { tools } = await client.listTools();
    const missing = "email_01k7c8m4q2f3e9v6t5r1n0p8yz";
    for (const tool of tools.filter((candidate) => candidate.name.startsWith("diagnose_"))) {
      const { required = [], properties = {} } = tool.inputSchema as {
        required?: string[];
        properties?: Record<string, unknown>;
      };
      const fields = required.length > 0 ? required : Object.keys(properties).slice(0, 1);
      const answer = await client.callTool({
        name: tool.name,
        arguments: Object.fromEntries(fields.map((name) => [name, missing])),
      });
      expect(JSON.stringify(answer)).not.toMatch(LOCAL_ONLY);
    }
  });
});

describe("api_get and the CSV exports", () => {
  const EXPORT_PAGE = 1000;
  const CONTACTS = EXPORT_PAGE * 2 + 500;

  /** More contacts than one page of the export, in the tenant's sandbox environment. */
  async function seedContacts(tenant: TestTenant) {
    await db.insert(contact).values(
      Array.from({ length: CONTACTS }, (_, i) => ({
        organizationId: tenant.organization.id,
        projectId: tenant.project.id,
        environmentId: tenant.development.id,
        address: `person-${i}-${uniqueSuffix()}@example.com`,
        source: "api" as const,
      })),
    );
  }

  /** Counts the export's page queries. */
  function countExportQueries() {
    const spy = spyOn(pool, "query");
    return {
      count: () =>
        spy.mock.calls.filter(([query]) => {
          const text = typeof query === "string" ? query : (query as { text?: string }).text;
          return text?.includes('from "contact"') && text.includes('order by "contact"."id"');
        }).length,
      restore: () => spy.mockRestore(),
    };
  }

  const authorized = (key: string) => ({ headers: { Authorization: `Bearer ${key}` } });

  test("reads JSON through the API", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const client = await connect(app, tenant.sandboxKey);
    const answer = await callTool(client, "api_get", { path: "/v1/environment" });
    expect(answer.isError).toBe(false);
    expect(JSON.stringify(answer.data.data)).toContain(tenant.development.id);
  });

  test("refuses every spelling of an export, with nothing dispatched", async () => {
    const tenant = await createTestTenant();
    const { app } = hostedApp();
    const seen: string[] = [];
    const original = app.fetch.bind(app);
    app.fetch = ((request: Request) => {
      seen.push(new URL(request.url).pathname);
      return original(request);
    }) as typeof app.fetch;
    const client = await connect(app, tenant.sandboxKey);
    seen.length = 0;
    for (const path of [
      "/v1/contacts/export",
      "/v1/contacts/export/",
      "/v1/contacts/export?status=subscribed",
      "/v1/suppressions/export",
      "/v1/%63ontacts/export",
      "/v1/contacts/../contacts/export",
    ]) {
      const refused = await client.callTool({ name: "api_get", arguments: { path } });
      expect(refused.isError).toBe(true);
    }
    expect(seen.filter((path) => path.endsWith("/export"))).toEqual([]);
  });

  test("the real export pages through everything when it is read, as the control", async () => {
    const tenant = await createTestTenant();
    await seedContacts(tenant);
    const { app } = hostedApp();
    const queries = countExportQueries();
    try {
      const response = await app.request("/v1/contacts/export", authorized(tenant.sandboxKey));
      expect(response.headers.get("content-type")).toContain("text/csv");
      const csv = await response.text();
      expect(csv.trim().split("\n").length).toBe(CONTACTS + 1);
      expect(queries.count()).toBe(3);
    } finally {
      queries.restore();
    }
  });

  test("the real export stops querying when its stream is cancelled", async () => {
    const tenant = await createTestTenant();
    await seedContacts(tenant);
    const { app } = hostedApp();
    const queries = countExportQueries();
    try {
      const response = await app.request("/v1/contacts/export", authorized(tenant.sandboxKey));
      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      await reader.read();
      await reader.cancel();
      const after = queries.count();
      expect(after).toBeLessThan(3);
      await Bun.sleep(100);
      expect(queries.count()).toBe(after);
    } finally {
      queries.restore();
    }
  });

  test("a real CSV route that got past api_get is refused unread, and stops", async () => {
    const tenant = await createTestTenant();
    await seedContacts(tenant);
    const { app } = hostedApp();
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    const queries = countExportQueries();
    try {
      // `refusedPath` keeps tools off these routes. This is what's behind it, if one is ever missed.
      const response = await mcp.handle(
        new Request(MCP_URL, {
          method: "POST",
          headers: { ...MCP_HEADERS, "Mcp-Protocol-Version": "2025-06-18" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "api_get", arguments: { path: "/v1/contacts" } },
          }),
        }),
        {
          apiKey: tenant.sandboxKey,
          apiFetch: (request) =>
            app.fetch(new Request(`${new URL(request.url).origin}/v1/contacts/export`, request)),
        },
      );
      expect(response.status).toBe(200);
      const { result } = (await response.json()) as {
        result: { isError?: boolean; content: { text: string }[] };
      };
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("unsupported_response");
      const after = queries.count();
      expect(after).toBeLessThan(3);
      await Bun.sleep(100);
      expect(queries.count()).toBe(after);
      expect(await mcp.drain(1_000)).toBe(true);
    } finally {
      queries.restore();
    }
  });
});

describe("stopping", () => {
  test("the server waits for tools' API calls before closing what they use", () => {
    // `src/index.ts` can't be imported (it starts the server), so this reads the order it stops in.
    const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const drained = index.indexOf("mcp.drain(MCP_DRAIN_MS)");
    expect(drained).toBeGreaterThan(-1);
    expect(index.indexOf("logWriter.close()", drained)).toBeGreaterThan(drained);
    expect(index.indexOf("closeDb()", drained)).toBeGreaterThan(drained);
  });

  const slowApi = (ms: number) => () =>
    new Promise<Response>((resolve) => setTimeout(() => resolve(new Response()), ms));

  test("a request past its deadline answers 504 with its id, and calls nothing further", async () => {
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test", timeoutMs: 20 });
    const started = Date.now();
    const response = await mcp.handle(
      new Request(MCP_URL, {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "get_setup", arguments: {} },
        }),
      }),
      {
        apiKey: "coss_test_x",
        apiFetch: slowApi(2_000),
      },
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(response.status).toBe(504);
    const body = await protocolErrorOf(response);
    expect(body.id).toBe(7);
    expect(body.error.message).toContain("may have taken effect");
  });

  test("SIGTERM's signal answers at once, like long polls", async () => {
    const shutdown = new AbortController();
    const tenant = await createTestTenant();
    // A tool that won't finish on its own: only the signal can answer this request.
    let toolStarted = () => {};
    const started = new Promise<void>((resolve) => {
      toolStarted = resolve;
    });
    const { app } = hostedApp({
      shutdownSignal: shutdown.signal,
      mcp: createHostedMcp({
        apiBaseUrl: "http://api.test",
        docs: {
          fetch: (() => {
            toolStarted();
            return new Promise<Response>(() => {});
          }) as unknown as typeof fetch,
        },
      }),
    });
    const inFlight = post(
      app,
      tenant.sandboxKey,
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "read_docs", arguments: { page: "/docs/webhooks" } },
      },
      { "Mcp-Protocol-Version": "2025-06-18" },
    );
    await started;
    shutdown.abort();
    const answered = await inFlight;
    expect(answered.status).toBe(503);
    expect((await protocolErrorOf(answered)).id).toBe(8);

    const stopped = await post(app, tenant.sandboxKey, TOOLS_LIST);
    expect(stopped.status).toBe(503);
    expect(stopped.headers.get("retry-after")).toBe("1");
    await protocolErrorOf(stopped);
  });
});
