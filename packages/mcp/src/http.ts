/**
 * The hosted server (`https://api.coss.com/mcp`): Streamable HTTP, stateless. Every POST gets a new
 * server and a new SDK client holding the caller's key, and both are gone when it is answered, so
 * nothing about a caller outlives their request. Authenticating the caller, rate limits and how
 * the API is reached belong to the embedder (`apps/api`, `src/routes/mcp.ts`).
 *
 * Nothing a request carries decides where this server connects. The API's origin and the docs'
 * are options set when the process starts, each checked again on every outgoing request.
 */
import {
  type AuthInfo,
  createMcpHandler,
  isJsonContentType,
  isLegacyRequest,
  ProtocolError,
  readRequestBody,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { Coss, type FetchLike } from "coss";
import { createCossMcpServer } from "./server.ts";
import { DEFAULT_DOCS_URL, type DocsOptions } from "./tools/docs.ts";

/** No tool takes attachments or files here, so a request is arguments and text. */
export const HOSTED_MAX_BODY_BYTES: number = 1024 * 1024;
/** Under the 60 s CloudFront and the load balancer wait for an answer. */
export const HOSTED_TIMEOUT_MS: number = 50_000;
/** One API call of a tool, so a stuck one leaves time to answer that it failed. */
const API_CALL_TIMEOUT_MS = 45_000;

/** JSON-RPC's code for an error of the server, used by the MCP SDK for the same refusals. */
const SERVER_ERROR = -32000;
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const INTERNAL_ERROR = -32603;

const POSSIBLY_DONE =
  "If this called a tool that changes something, it may have taken effect: check before calling it again.";

type JsonRpcId = string | number | null;

function protocolError(
  status: number,
  code: number,
  message: string,
  options: { id?: JsonRpcId; headers?: Record<string, string> } = {},
): Response {
  return Response.json(
    { jsonrpc: "2.0", id: options.id ?? null, error: { code, message } },
    { status, ...(options.headers ? { headers: options.headers } : {}) },
  );
}

/** The caller of one request. Made by the embedder after authenticating it, never from its input. */
export interface HostedMcpCaller {
  /** The API key that was just authenticated; the tools call the API with it. */
  apiKey: string;
  /** How the tools' API calls reach the API. Only ever given requests for its own `/v1/*`. */
  apiFetch: (request: Request) => Response | Promise<Response>;
  /** The client went away or the server is stopping: answer now, and call nothing further. */
  signal?: AbortSignal;
}

export interface HostedMcpOptions {
  /** The API's origin, fixed for the process (`API_PUBLIC_URL`). */
  apiBaseUrl: string;
  /** Where the docs tools read (default https://coss.com), fixed for the process. */
  docs?: DocsOptions;
  /** Default {@link HOSTED_MAX_BODY_BYTES}. */
  maxBodyBytes?: number;
  /** Default {@link HOSTED_TIMEOUT_MS}. */
  timeoutMs?: number;
  /**
   * A request failed in a way that isn't the caller's doing. Only the error's name: its message and
   * stack can quote what the caller sent, which is never logged.
   */
  onFailure?: (errorName: string) => void;
}

export interface HostedMcp {
  /**
   * Refuses what must not reach authentication: any request a browser made (the spec's protection
   * from DNS rebinding; no browser origin is allowed, so nothing here answers with CORS headers)
   * and anything but POST (stateless, so no stream to GET and no session to DELETE). `null`: go on.
   */
  precheck(request: Request): Response | null;
  /** Answers one authenticated POST. Never rejects. */
  handle(request: Request, caller: HostedMcpCaller): Promise<Response>;
}

/** The `Promise` of `work`, which rejects with the signal's reason if that comes first. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted();
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}

/** The API, and only its `/v1/*`: no id or path a tool is given can point the client elsewhere. */
function apiFetchFor(origin: string, caller: HostedMcpCaller, signal: AbortSignal): FetchLike {
  return async (input, init) => {
    const request =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith("/v1/")) {
      throw new Error("The hosted server only calls the coss.com API.");
    }
    const stop = AbortSignal.any([signal, request.signal]);
    return untilAborted(Promise.resolve(caller.apiFetch(request)), stop);
  };
}

/** The docs, and only at their origin: a redirect is an answer, never followed elsewhere. */
function docsFetchFor(origin: string, base: typeof fetch, signal: AbortSignal): typeof fetch {
  const docsFetch = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const href = input instanceof Request ? input.url : String(input);
    if (new URL(href).origin !== origin) {
      return Promise.reject(new Error("The hosted server only reads coss.com's docs."));
    }
    return base(input, {
      ...init,
      redirect: "manual",
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    });
  };
  return docsFetch as typeof fetch;
}

interface ServedCaller {
  caller: HostedMcpCaller;
  signal: AbortSignal;
}

export function createHostedMcp(options: HostedMcpOptions): HostedMcp {
  const apiOrigin = new URL(options.apiBaseUrl).origin;
  const docsOrigin = new URL(options.docs?.baseUrl ?? DEFAULT_DOCS_URL).origin;
  const docsBase = options.docs?.fetch ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? HOSTED_MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? HOSTED_TIMEOUT_MS;
  const report = (error: unknown) =>
    options.onFailure?.(error instanceof Error ? error.name : "UnknownError");

  const serverFor = ({ caller, signal }: ServedCaller) =>
    createCossMcpServer({
      transport: "hosted",
      coss: new Coss({
        apiKey: caller.apiKey,
        baseUrl: apiOrigin,
        fetch: apiFetchFor(apiOrigin, caller, signal),
        timeout: API_CALL_TIMEOUT_MS,
        // Retries wait, and the client decides what happens after an error.
        maxRetries: 0,
        tracing: false,
      }),
      apiKey: caller.apiKey,
      docs: { baseUrl: docsOrigin, fetch: docsFetchFor(docsOrigin, docsBase, signal) },
    });

  // The 2026-07-28 revision, per request. `json`: answers are one body, so the deadline below can
  // always answer instead, and `maxSubscriptions: 0` refuses `subscriptions/listen`, the one stream
  // this would otherwise hold open past the request's deadline and through a deploy.
  const modern = createMcpHandler(
    (context) => serverFor(context.authInfo?.extra?.served as ServedCaller),
    {
      legacy: "reject",
      responseMode: "json",
      maxSubscriptions: 0,
      keepAliveMs: 0,
      maxRequestBodySize: maxBodyBytes,
      // Refusals land here too, and those are the client's doing.
      onerror: (error) => {
        if (!(error instanceof ProtocolError) && !error.message.startsWith("Rejected "))
          report(error);
      },
    },
  );

  /** 2025-era clients: what `createMcpHandler`'s fallback does, but answering with one JSON body. */
  async function serveLegacy(request: Request, parsedBody: unknown, served: ServedCaller) {
    const server = serverFor(served);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: maxBodyBytes,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(request, { parsedBody });
    } finally {
      await server.close();
    }
  }

  return {
    precheck(request) {
      if (request.headers.has("origin")) {
        return protocolError(
          403,
          SERVER_ERROR,
          "This endpoint doesn't take requests from browsers.",
        );
      }
      if (request.method !== "POST") {
        return protocolError(
          405,
          SERVER_ERROR,
          "Method not allowed. This server is stateless: POST only.",
          {
            headers: { Allow: "POST" },
          },
        );
      }
      return null;
    },

    async handle(request, caller) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = caller.signal ? AbortSignal.any([caller.signal, deadline]) : deadline;
      let id: JsonRpcId = null;

      const serve = async (): Promise<Response> => {
        if (!isJsonContentType(request.headers.get("content-type"))) {
          return protocolError(415, SERVER_ERROR, "Content-Type must be application/json.");
        }
        const body = await readRequestBody(request, maxBodyBytes);
        if (body.tooLarge) {
          return protocolError(
            413,
            SERVER_ERROR,
            `The request body must not exceed ${maxBodyBytes} bytes.`,
          );
        }
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(body.text);
        } catch {
          return protocolError(400, PARSE_ERROR, "The request body is not valid JSON.");
        }
        // Dropped from the protocol in 2025-06-18, and one request here is one rate limit token.
        if (Array.isArray(parsedBody)) {
          return protocolError(400, INVALID_REQUEST, "JSON-RPC batches aren't supported.");
        }
        const claimedId = (parsedBody as { id?: unknown } | null)?.id;
        if (typeof claimedId === "string" || typeof claimedId === "number") id = claimedId;

        const served: ServedCaller = { caller, signal };
        if (await isLegacyRequest(request, parsedBody, { maxRequestBodySize: maxBodyBytes })) {
          return serveLegacy(request, parsedBody, served);
        }
        const authInfo: AuthInfo = {
          token: caller.apiKey,
          clientId: "coss",
          scopes: [],
          extra: { served },
        };
        return modern.fetch(request, { parsedBody, authInfo });
      };

      const stopped = new Promise<Response>((resolve) => {
        const stop = () =>
          resolve(
            deadline.aborted
              ? protocolError(504, INTERNAL_ERROR, `This took too long. ${POSSIBLY_DONE}`, { id })
              : protocolError(
                  503,
                  SERVER_ERROR,
                  `The server is restarting: try again. ${POSSIBLY_DONE}`,
                  {
                    id,
                    headers: { "Retry-After": "1" },
                  },
                ),
          );
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      });

      return Promise.race([
        serve().catch((error: unknown) => {
          report(error);
          return protocolError(500, INTERNAL_ERROR, "Internal error.", { id });
        }),
        stopped,
      ]);
    },
  };
}
