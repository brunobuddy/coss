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
/**
 * The most one API call's answer may hold in memory. Tools' answers are small (they're for a model
 * to read), and the API streams some routes in-process with nothing else to stop them.
 */
export const HOSTED_MAX_API_RESPONSE_BYTES: number = 8 * 1024 * 1024;

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
  /** Default 45 s (tests). */
  apiCallTimeoutMs?: number;
  /** Default {@link HOSTED_MAX_API_RESPONSE_BYTES}. */
  maxApiResponseBytes?: number;
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
  /**
   * Waits for API calls still running (a stopped request is answered at once, and its call finishes
   * on its own), up to `limitMs`, so the embedder doesn't close what they use. `false`: some still are.
   */
  drain(limitMs: number): Promise<boolean>;
}

/** The `Promise` of `work`, which rejects with the signal's reason if that comes first. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted();
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}

/**
 * An API call this server answers itself, in the API's error envelope, whose `hint` the tool's answer
 * then carries (`result.ts`'s own hints are the local server's: its env vars don't exist here).
 */
function failedCall(status: number, code: string, message: string, hint: string): Response {
  return Response.json({ error: { type: "api_error", code, message, hint } }, { status });
}

const API_DOWN_HINT = "This isn't the request's fault: try again shortly.";

/**
 * The whole body in memory, at most `maxBytes` of it: `null` past that. Cancelled on `stop`, or when
 * it's over: in process, nothing else ties a streaming route to this request once it has headers.
 */
async function readWithin(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  stop: AbortSignal,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const cancel = () => void reader.cancel(stop.reason).catch(() => {});
  if (stop.aborted) cancel();
  else stop.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      stop.throwIfAborted();
      if (done) return Buffer.concat(chunks);
      // Bun lets a stream carry strings, whose `byteLength` would leave this uncounted.
      const chunk = typeof (value as unknown) === "string" ? Buffer.from(value) : value;
      size += chunk.byteLength;
      if (size > maxBytes) return null;
      chunks.push(chunk);
    }
  } finally {
    stop.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => {});
  }
}

/**
 * The answer as the SDK will read it: JSON, whole, and small enough. Its `response.text()` would
 * otherwise buffer a streaming route's body with nothing to stop it, which no signal reaches.
 */
async function readAnswer(
  response: Response,
  maxBytes: number,
  stop: AbortSignal,
): Promise<Response> {
  if (response.body === null) return response;
  const refuse = (failure: Response) => {
    void response.body?.cancel().catch(() => {});
    return failure;
  };
  if (response.ok && !isJsonContentType(response.headers.get("content-type"))) {
    return refuse(
      failedCall(
        502,
        "unsupported_response",
        "This call answers with something other than JSON, which the hosted MCP server doesn't read.",
        "Call this endpoint with the API or an SDK instead.",
      ),
    );
  }
  const tooLarge = () =>
    failedCall(
      502,
      "response_too_large",
      `The API's answer is larger than the ${maxBytes} bytes the hosted MCP server reads.`,
      "Ask for less, with a narrower filter or a smaller limit, or use the API or an SDK.",
    );
  if (Number(response.headers.get("content-length")) > maxBytes) return refuse(tooLarge());
  const bytes = await readWithin(response.body, maxBytes, stop);
  if (bytes === null) return tooLarge();
  const { status, statusText, headers } = response;
  if (status !== 401) return new Response(bytes, { status, statusText, headers });
  // A key revoked while this request ran: the API's refusal, with what to do about it here.
  const refused = JSON.parse(bytes.toString()) as { error: Record<string, unknown> };
  refused.error.hint ??=
    "The API key in this server's Authorization header was refused: check it wasn't revoked.";
  return new Response(JSON.stringify(refused), { status, statusText, headers });
}

/** The API, and only its `/v1/*`: no id or path a tool is given can point the client elsewhere. */
function apiFetchFor(
  origin: string,
  maxBytes: number,
  caller: HostedMcpCaller,
  signal: AbortSignal,
  track: (call: Promise<void>) => void,
): FetchLike {
  return async (input, init) => {
    const request =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith("/v1/")) {
      throw new Error("The hosted server only calls the coss.com API.");
    }
    const stop = AbortSignal.any([signal, request.signal]);
    stop.throwIfAborted();
    const dispatched = (async () => caller.apiFetch(request))();
    // Runs on after a stop: a drain waits for it, and an answer nobody will read is cancelled.
    track(
      dispatched.then(
        async (response) => {
          if (stop.aborted) await response.body?.cancel();
        },
        () => {},
      ),
    );
    try {
      return await readAnswer(await untilAborted(dispatched, stop), maxBytes, stop);
    } catch (error) {
      // Its request has been answered, so nobody reads what becomes of this.
      if (signal.aborted) throw error;
      return request.signal.aborted
        ? failedCall(504, "request_timeout", "The API took too long to answer.", API_DOWN_HINT)
        : failedCall(502, "api_unavailable", "The API couldn't answer.", API_DOWN_HINT);
    }
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
  const maxApiResponseBytes = options.maxApiResponseBytes ?? HOSTED_MAX_API_RESPONSE_BYTES;
  const report = (error: unknown) =>
    options.onFailure?.(error instanceof Error ? error.name : "UnknownError");

  const inFlight = new Set<Promise<void>>();
  const track = (call: Promise<void>) => {
    inFlight.add(call);
    // A cancel that fails has nothing left to wait for.
    void call.catch(() => {}).finally(() => inFlight.delete(call));
  };

  const serverFor = ({ caller, signal }: ServedCaller) =>
    createCossMcpServer({
      transport: "hosted",
      coss: new Coss({
        apiKey: caller.apiKey,
        baseUrl: apiOrigin,
        fetch: apiFetchFor(apiOrigin, maxApiResponseBytes, caller, signal, track),
        timeout: options.apiCallTimeoutMs ?? API_CALL_TIMEOUT_MS,
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
          // After a stop this is an upload the client dropped, or similar, already answered.
          if (!signal.aborted) report(error);
          return protocolError(500, INTERNAL_ERROR, "Internal error.", { id });
        }),
        stopped,
      ]);
    },

    async drain(limitMs) {
      const deadline = Date.now() + limitMs;
      while (inFlight.size > 0) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.allSettled(inFlight),
          new Promise((resolve) => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
        clearTimeout(timer);
      }
      return true;
    },
  };
}
