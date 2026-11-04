/**
 * The hosted server serves callers who aren't on this machine: the disk here is none of theirs.
 * Every tool it offers is called with paths for arguments, and must touch nothing.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as realFsPromises from "node:fs/promises";
import { connect } from "node:net";
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

  test("nothing new touches files or the environment without saying what it does when hosted", () => {
    // Tools, prompts and resources alike. Anything that reads or writes files gates on
    // `projectDir === null` (`ToolContext`), and is listed here once it does. A failure means: gate
    // it, and add it to the exercise above. `cli.ts` and `project-env.ts` are stdio's, and
    // `server.ts` only falls back to the working directory when not hosted.
    const src = join(import.meta.dir, "../src");
    const touching = readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .filter((file) =>
        /node:(fs|path|child_process|os)|project-env|process\.(env|cwd|argv)/.test(
          readFileSync(join(src, file), "utf8"),
        ),
      );
    expect(touching.sort()).toEqual([
      "cli.ts",
      "project-env.ts",
      "server.ts",
      "tools/sign.ts",
      "tools/webhooks.ts",
    ]);
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

describe("what an API call may answer", () => {
  const MIB = 1024 * 1024;
  const CHUNK = new Uint8Array(64 * 1024).fill(120);
  const toolCall = (name: string, args: Record<string, unknown> = {}, id = 1) =>
    new Request("http://api.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });

  /** A body that never ends (or, with `stalled`, never answers), saying how it was treated. */
  function endless({ stalled = false } = {}) {
    const state = { bytes: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (stalled) return new Promise<void>(() => {});
        // Endless to whatever is reading, up to where a regression should fail, not hang the run.
        if (state.bytes > 64 * MIB) return controller.close();
        state.bytes += CHUNK.byteLength;
        controller.enqueue(CHUNK);
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { state, body };
  }

  /** `find_emails`'s one API call answered by `apiFetch`, read as a tool's answer. */
  async function toolAnswer(
    apiFetch: (request: Request) => Response | Promise<Response>,
    options: Partial<Parameters<typeof createHostedMcp>[0]> = {},
  ) {
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test", ...options });
    const response = await mcp.handle(toolCall("find_emails"), {
      apiKey: "coss_test_x",
      apiFetch,
    });
    const { result } = (await response.json()) as {
      result: { isError?: boolean; content: { text: string }[] };
    };
    const text = result.content[0]?.text ?? "null";
    return {
      status: response.status,
      isError: result.isError === true,
      text,
      data: JSON.parse(text),
    };
  }

  test("a JSON answer that never ends is cut at 8 MiB, cancelled, and a tool error", async () => {
    const { state, body } = endless();
    const answer = await toolAnswer(
      () => new Response(body, { headers: { "Content-Type": "application/json" } }),
    );
    expect(answer.status).toBe(200);
    expect(answer.isError).toBe(true);
    expect(answer.data.error.code).toBe("response_too_large");
    expect(state.cancelled).toBe(true);
    expect(state.bytes).toBeGreaterThan(8 * MIB);
    expect(state.bytes).toBeLessThan(8 * MIB + 4 * CHUNK.byteLength);
  });

  test("a declared length over the cap isn't read at all", async () => {
    const { state, body } = endless();
    const answer = await toolAnswer(
      () =>
        new Response(body, {
          headers: { "Content-Type": "application/json", "Content-Length": String(9 * MIB) },
        }),
    );
    expect(answer.data.error.code).toBe("response_too_large");
    expect(state.cancelled).toBe(true);
    expect(state.bytes).toBeLessThanOrEqual(CHUNK.byteLength);
  });

  test("a 2xx that isn't JSON is refused and cancelled before it is read", async () => {
    const { state, body } = endless();
    const answer = await toolAnswer(
      () => new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8" } }),
    );
    expect(answer.isError).toBe(true);
    expect(answer.data.error.code).toBe("unsupported_response");
    expect(state.cancelled).toBe(true);
    expect(state.bytes).toBeLessThanOrEqual(CHUNK.byteLength);
  });

  test("an answer with no body is passed on, and JSON of any charset is read", async () => {
    const empty = await toolAnswer(() => new Response(null, { status: 204 }));
    expect(empty.text).not.toContain("unsupported_response");
    const json = await toolAnswer(
      () =>
        new Response('{"data":[],"has_more":false}', {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
    );
    expect(json.isError).toBe(false);
  });

  test.each([
    ["the deadline", 504, { timeoutMs: 30 }, false],
    ["the caller's signal (SIGTERM, a disconnect)", 503, {}, true],
  ] as const)("%s cancels a body being read", async (_name, status, options, aborts) => {
    const { state, body } = endless({ stalled: true });
    const controller = new AbortController();
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test", ...options });
    let dispatched = () => {};
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const answering = mcp.handle(toolCall("find_emails"), {
      apiKey: "coss_test_x",
      signal: controller.signal,
      apiFetch: () => {
        dispatched();
        return new Response(body, { headers: { "Content-Type": "application/json" } });
      },
    });
    await started;
    if (aborts) controller.abort();
    const response = await answering;
    expect(response.status).toBe(status);
    await Bun.sleep(5);
    expect(state.cancelled).toBe(true);
  });

  test("an answer that arrives after the abort is cancelled too", async () => {
    const { state, body } = endless();
    const controller = new AbortController();
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    let answer = (_response: Response) => {};
    let dispatched = () => {};
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const response = await (async () => {
      const answering = mcp.handle(toolCall("find_emails"), {
        apiKey: "coss_test_x",
        signal: controller.signal,
        apiFetch: () => {
          dispatched();
          return new Promise<Response>((resolve) => {
            answer = resolve;
          });
        },
      });
      await started;
      controller.abort();
      return answering;
    })();
    expect(response.status).toBe(503);
    answer(new Response(body, { headers: { "Content-Type": "application/json" } }));
    await Bun.sleep(5);
    expect(state.cancelled).toBe(true);
  });

  test("nothing is dispatched once the request has been stopped", async () => {
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    const dispatched: string[] = [];
    const response = await mcp.handle(toolCall("find_emails"), {
      apiKey: "coss_test_x",
      signal: AbortSignal.abort(),
      apiFetch: (request) => {
        dispatched.push(request.url);
        return Response.json({ data: [], has_more: false });
      },
    });
    expect(response.status).toBe(503);
    // The tool itself runs on behind the answer: give it the time to try.
    await Bun.sleep(20);
    expect(dispatched).toEqual([]);
  });

  test("hosted answers never point at the local server's configuration", async () => {
    const answers = [
      // A key revoked while its request is in flight.
      await toolAnswer(() =>
        Response.json(
          {
            error: {
              type: "authentication_error",
              code: "invalid_api_key",
              message: "The API key is invalid, revoked or expired.",
              request_id: "req_1",
            },
          },
          { status: 401 },
        ),
      ),
      // The API failing to answer at all, and answering too slowly.
      await toolAnswer(() => {
        throw new Error("secret detail");
      }),
      await toolAnswer(() => new Promise<Response>(() => {}), { apiCallTimeoutMs: 10 }),
    ];
    expect(answers[0]?.data.error).toMatchObject({ code: "invalid_api_key", request_id: "req_1" });
    expect(answers[0]?.data.hint).toContain("Authorization header");
    expect(answers[1]?.data.error.code).toBe("api_unavailable");
    expect(answers[2]?.data.error.code).toBe("request_timeout");
    for (const answer of answers) {
      expect(answer.isError).toBe(true);
      expect(typeof answer.data.hint).toBe("string");
      expect(answer.text).not.toMatch(/COSS_API_KEY|COSS_BASE_URL|secret detail/);
    }

    const client = await hostedClient((async () => Response.json({})) as unknown as typeof fetch);
    expect(client.getInstructions()).not.toMatch(/COSS_API_KEY|COSS_BASE_URL/);
    const { tools } = await client.listTools();
    expect(JSON.stringify(tools)).not.toMatch(/COSS_API_KEY|COSS_BASE_URL/);
  });
});

describe("dropped uploads", () => {
  test("a client that goes away mid-body isn't reported as a failure", async () => {
    const failures: string[] = [];
    const statuses: number[] = [];
    const mcp = createHostedMcp({
      apiBaseUrl: "http://api.test",
      onFailure: (name) => failures.push(name),
    });
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (request) => {
        const response = await mcp.handle(request, {
          apiKey: "coss_test_x",
          apiFetch: () => new Response(),
          signal: request.signal,
        });
        statuses.push(response.status);
        return response;
      },
    });
    try {
      const socket = connect(server.port as number, "127.0.0.1");
      await new Promise((resolve) => socket.once("connect", resolve));
      socket.write(
        "POST /mcp HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n" +
          'Content-Length: 100000\r\n\r\n{"jsonrpc":',
      );
      await Bun.sleep(50);
      socket.destroy();
      for (let i = 0; i < 100 && statuses.length === 0; i++) await Bun.sleep(5);
      // The body's read fails after the answer: give it the time to report.
      await Bun.sleep(20);
    } finally {
      server.stop(true);
    }
    expect(statuses).toEqual([503]);
    expect(failures).toEqual([]);
  });
});

describe("drain", () => {
  const post = () =>
    new Request("http://api.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "find_emails", arguments: {} },
      }),
    });

  /** A request stopped with its API call still running, as SIGTERM leaves one. */
  async function stoppedInFlight() {
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    const controller = new AbortController();
    let finish = () => {};
    let dispatched = () => {};
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    const answering = mcp.handle(post(), {
      apiKey: "coss_test_x",
      signal: controller.signal,
      apiFetch: () => {
        dispatched();
        return new Promise<Response>((resolve) => {
          finish = () => resolve(Response.json({ data: [], has_more: false }));
        });
      },
    });
    await started;
    controller.abort();
    expect((await answering).status).toBe(503);
    return { mcp, finish: () => finish() };
  }

  test("waits for API calls still running after their request was answered", async () => {
    const { mcp, finish } = await stoppedInFlight();
    let drained = false;
    const draining = mcp.drain(5_000).then((clean) => {
      drained = true;
      return clean;
    });
    await Bun.sleep(10);
    expect(drained).toBe(false);
    finish();
    expect(await draining).toBe(true);
  });

  test("gives up at its limit, and says so", async () => {
    const { mcp } = await stoppedInFlight();
    const started = Date.now();
    expect(await mcp.drain(20)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test("with nothing running, answers at once", async () => {
    const mcp = createHostedMcp({ apiBaseUrl: "http://api.test" });
    expect(await mcp.drain(5_000)).toBe(true);
  });
});
