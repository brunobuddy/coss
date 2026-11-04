/**
 * The hosted server serves callers who aren't on this machine: the disk here is none of theirs.
 * Every tool it offers is called with paths for arguments, and must touch nothing.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as realFsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Coss } from "coss";

const CANARY = "COSS_API_KEY=coss_test_canary\nCOSS_WEBHOOK_SECRET=whsec_canary\n";
const fsCalls: string[] = [];

// Every call the tools could make through `node:fs/promises` (`project-env.ts`, `tools/sign.ts`).
mock.module("node:fs/promises", () => {
  const counted: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(realFsPromises)) {
    counted[name] =
      typeof value === "function"
        ? (...args: unknown[]) => {
            fsCalls.push(name);
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value;
  }
  return { ...counted, default: counted };
});

const { createCossMcpServer } = await import("../src/server.ts");
const { createHostedMcp } = await import("../src/http.ts");
const { InMemoryTransport } = await import("@modelcontextprotocol/server");

let dir: string;
const originalCwd = process.cwd();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "coss-mcp-hosted-"));
  writeFileSync(join(dir, ".env"), CANARY);
  writeFileSync(join(dir, "secret.pdf"), "%PDF-canary");
  process.chdir(dir);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

/** A value for each required property, with every string a path somebody would like read. */
function argumentsFor(schema: unknown): unknown {
  const node = schema as {
    type?: string | string[];
    enum?: unknown[];
    const?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
    minimum?: number;
    anyOf?: unknown[];
    oneOf?: unknown[];
  };
  if (node.const !== undefined) return node.const;
  if (node.enum) return node.enum[0];
  const variant = node.anyOf?.[0] ?? node.oneOf?.[0];
  if (variant) return argumentsFor(variant);
  const type = Array.isArray(node.type) ? node.type[0] : node.type;
  if (type === "object") {
    return Object.fromEntries(
      Object.entries(node.properties ?? {})
        .filter(([name]) => node.required?.includes(name) || /path|file|dir/i.test(name))
        .map(([name, value]) => [name, argumentsFor(value)]),
    );
  }
  if (type === "array") return [argumentsFor(node.items ?? { type: "string" })];
  if (type === "number" || type === "integer") return node.minimum ?? 1;
  if (type === "boolean") return true;
  return join(dir, ".env");
}

async function hostedClient(fetchApi: typeof fetch) {
  const server = createCossMcpServer({
    transport: "hosted",
    // A caller can't pass this, and it must not matter if something does.
    projectDir: dir,
    coss: new Coss({
      apiKey: "coss_test_x",
      baseUrl: "http://api.test",
      fetch: fetchApi,
      maxRetries: 0,
    }),
    apiKey: "coss_test_x",
    docs: {
      fetch: (async () => new Response("# Docs")) as unknown as typeof fetch,
    },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "hosted-test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("transport: hosted", () => {
  test("no tool reads or writes the disk, whatever it's given", async () => {
    // The API answers everything, so tools that write after a call get that far.
    const api = (async () =>
      Response.json({
        id: "whe_1",
        object: "webhook_endpoint",
        url: "https://example.com/hooks",
        secret: "whsec_new",
        enabled: true,
        event_types: [],
        data: [],
        has_more: false,
      })) as unknown as typeof fetch;
    const client = await hostedClient(api);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(50);

    fsCalls.length = 0;
    const leaked: string[] = [];
    for (const tool of tools) {
      const result = await client.callTool({
        name: tool.name,
        arguments: argumentsFor(tool.inputSchema) as Record<string, unknown>,
      });
      if (JSON.stringify(result).includes("canary")) leaked.push(tool.name);
    }

    expect(fsCalls).toEqual([]);
    expect(leaked).toEqual([]);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe(CANARY);
    expect(readdirSync(dir).sort()).toEqual([".env", "secret.pdf"]);
    expect(existsSync(join(dir, ".env.local"))).toBe(false);
  });

  test("the same exercise on the stdio server does touch the disk (so the check above works)", async () => {
    const server = createCossMcpServer({
      projectDir: dir,
      coss: new Coss({
        apiKey: "coss_test_x",
        baseUrl: "http://api.test",
        maxRetries: 0,
        fetch: (async () =>
          Response.json({
            id: "whe_1",
            url: "https://example.com/other",
            secret: "whsec_new",
            data: [],
            has_more: false,
          })) as unknown as typeof fetch,
      }),
      apiKey: "coss_test_x",
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    await client.connect(clientSide);

    fsCalls.length = 0;
    await client.callTool({ name: "upload_sign_document", arguments: { path: "secret.pdf" } });
    await client.callTool({
      name: "create_webhook_endpoint",
      arguments: { url: "https://example.com/hooks" },
    });
    expect(fsCalls).toContain("realpath");
    expect(fsCalls).toContain("writeFile");
    // Back to what the first test expects, whichever order they run in.
    writeFileSync(join(dir, ".env"), CANARY);
  });

  test("the file tools aren't offered, and stdio still offers them", async () => {
    const client = await hostedClient((async () => Response.json({})) as unknown as typeof fetch);
    const hosted = (await client.listTools()).tools.map((tool) => tool.name);
    expect(hosted).not.toContain("upload_sign_document");

    const local = createCossMcpServer({
      coss: new Coss({ apiKey: "coss_test_x", baseUrl: "http://api.test" }),
      apiKey: "coss_test_x",
      projectDir: dir,
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await local.connect(serverSide);
    const localClient = new Client({ name: "stdio-test", version: "0.0.0" });
    await localClient.connect(clientSide);
    const names = (await localClient.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("upload_sign_document");
    expect(names.filter((name) => !hosted.includes(name))).toEqual(["upload_sign_document"]);
  });

  test("a new tool that touches files has to say what it does on the hosted server", () => {
    // Anything that reads or writes files gates on `projectDir === null` (`ToolContext`), and is
    // listed here once it does. A failure means: gate it, and add it to the exercise above.
    const toolsDir = join(import.meta.dir, "../src/tools");
    const touching = readdirSync(toolsDir).filter((file) =>
      /node:(fs|path|child_process|os)|project-env/.test(
        readFileSync(join(toolsDir, file), "utf8"),
      ),
    );
    expect(touching.sort()).toEqual(["sign.ts", "webhooks.ts"]);
  });
});

describe("server.json", () => {
  test("names this package, the hosted URL, and its version", () => {
    const read = (file: string) =>
      JSON.parse(readFileSync(join(import.meta.dir, "..", file), "utf8"));
    const pkg = read("package.json");
    const server = read("server.json");
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual([
      expect.objectContaining({ identifier: pkg.name, version: pkg.version }),
    ]);
    expect(server.remotes[0]).toMatchObject({
      type: "streamable-http",
      url: "https://api.coss.com/mcp",
    });
  });
});

describe("createHostedMcp", () => {
  const mcp = createHostedMcp({
    apiBaseUrl: "http://api.test",
    docs: { fetch: (async () => new Response("# Docs")) as unknown as typeof fetch },
  });
  const post = (body: unknown) =>
    new Request("http://api.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });

  test("an API call only ever goes to the API's own /v1", async () => {
    const seen: string[] = [];
    const response = await mcp.handle(
      post({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_email", arguments: { id: "../../../../health" } },
      }),
      {
        apiKey: "coss_test_x",
        apiFetch: (request) => {
          seen.push(request.url);
          return Response.json(
            { error: { type: "not_found_error", code: "nope", message: "x" } },
            { status: 404 },
          );
        },
      },
    );
    expect(response.status).toBe(200);
    for (const url of seen) {
      expect(new URL(url).origin).toBe("http://api.test");
      expect(new URL(url).pathname).toStartWith("/v1/");
    }
  });

  test("it serves a real Streamable HTTP client", async () => {
    const transport = new StreamableHTTPClientTransport(new URL("http://api.test/mcp"), {
      fetch: (input, init) => {
        const request = new Request(String(input), init);
        return mcp.precheck(request)
          ? Promise.resolve(mcp.precheck(request) as Response)
          : mcp.handle(request, {
              apiKey: "coss_test_x",
              apiFetch: () => Response.json({ data: [], has_more: false }),
            });
      },
    });
    const client = new Client({ name: "real", version: "0.0.0" });
    await client.connect(transport);
    expect((await client.listTools()).tools.length).toBeGreaterThan(50);
    await client.close();
  });

  test("precheck refuses browsers and anything but POST", () => {
    expect(mcp.precheck(post({}))).toBeNull();
    const browser = new Request("http://api.test/mcp", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(mcp.precheck(browser)?.status).toBe(403);
    const get = mcp.precheck(new Request("http://api.test/mcp"));
    expect(get?.status).toBe(405);
    expect(get?.headers.get("allow")).toBe("POST");
  });

  test("a failure reports its name only", async () => {
    const names: string[] = [];
    const failing = createHostedMcp({
      apiBaseUrl: "http://api.test",
      onFailure: (name) => names.push(name),
    });
    const request = post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    // A body that can't be read: the caller's data never reaches the report.
    await request.text();
    const response = await failing.handle(request, {
      apiKey: "coss_test_x",
      apiFetch: () => new Response(),
    });
    expect(response.status).toBe(500);
    expect(names).toEqual(["TypeError"]);
  });
});
