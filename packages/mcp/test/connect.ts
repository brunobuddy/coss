import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Coss } from "coss";
import { createCossMcpServer, type Toolset } from "../src/index.ts";
import { NOW } from "./fixtures.ts";

export type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown };

/** A `fetch` answering `METHOD /path` from a table, recording every request. */
function fakeApi(routes: Record<string, Route | unknown>) {
  const requests: { method: string; url: URL; body: unknown }[] = [];
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init.method ?? "GET";
    requests.push({
      method,
      url,
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    });
    const route = routes[`${method} ${url.pathname}`];
    if (route === undefined) {
      return Response.json(
        {
          error: {
            type: "not_found_error",
            code: "not_found",
            message: "Not found.",
            request_id: "req_test",
          },
        },
        { status: 404 },
      );
    }
    const { status = 200, body } =
      typeof route === "function" ? (route as Route)(url, init) : { body: route };
    return Response.json(body, { status });
  };
  return { fetch, requests };
}

export async function connect(
  routes: Record<string, Route | unknown>,
  apiKey = "coss_live_test",
  projectDir?: string,
  toolsets?: readonly Toolset[],
) {
  const api = fakeApi(routes);
  const coss = new Coss({ apiKey, baseUrl: "http://api.test", fetch: api.fetch, maxRetries: 0 });
  const server = createCossMcpServer({
    coss,
    apiKey,
    now: () => NOW,
    ...(projectDir ? { projectDir } : {}),
    ...(toolsets ? { toolsets } : {}),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return {
      isError: result.isError === true,
      // biome-ignore lint/suspicious/noExplicitAny: test assertions read arbitrary JSON.
      data: JSON.parse(content[0]?.text ?? "null") as any,
    };
  };
  return { client, call, requests: api.requests };
}
