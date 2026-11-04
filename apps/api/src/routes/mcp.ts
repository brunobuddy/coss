/**
 * `POST /mcp`: the hosted MCP server (`coss-mcp/http`). A plain route outside `/v1` and the OpenAPI
 * document, which answers in JSON-RPC rather than the error envelope: that's what MCP clients read.
 * Authentication and rate limits are the same middleware as `/v1/*`, then every tool calls `/v1/*`
 * with the caller's key, in process, so all of that and the logs apply again per API call.
 */
import type { HostedMcp } from "coss-mcp/http";
import { Hono } from "hono";
import { toApiError } from "../errors.ts";
import { bearerKey, requireApiKey } from "../middleware/api-key.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { AppEnv } from "../types.ts";

/** What the MCP SDK answers refusals with too; `data` carries the API's own type and code. */
const SERVER_ERROR = -32000;
const INTERNAL_ERROR = -32603;

export function createMcpRoutes(options: {
  mcp: HostedMcp;
  shutdownSignal: AbortSignal;
  apiFetch: (request: Request, callerIp: string | null) => Response | Promise<Response>;
}) {
  const router = new Hono<AppEnv>();

  // Authentication and rate limit refusals, with `/v1`'s statuses and headers. Nothing has read the
  // body yet, so nothing a caller sent can reach this log line.
  router.onError((error, c) => {
    const apiError = toApiError(error);
    if (apiError) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: SERVER_ERROR,
            message: apiError.message,
            data: { type: apiError.type, code: apiError.code, request_id: c.var.requestId },
          },
        },
        apiError.status,
        apiError.headers,
      );
    }
    console.error(`[api] Unhandled error (request_id=${c.var.requestId}) on POST /mcp:`, error);
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: INTERNAL_ERROR,
          message: "Internal error.",
          data: { type: "api_error", code: "internal_error", request_id: c.var.requestId },
        },
      },
      500,
    );
  });

  router.use(async (c, next) => {
    const refused = options.mcp.precheck(c.req.raw);
    if (refused) return refused;
    await next();
  });

  router.post("/", requireApiKey({}), rateLimit("api.mcp"), async (c) => {
    // `requireApiKey` just authenticated this very header.
    const apiKey = bearerKey(c.req.header("Authorization")) as string;
    const callerIp = c.var.clientIp;
    const answer = await options.mcp.handle(c.req.raw, {
      apiKey,
      apiFetch: (request) => options.apiFetch(request, callerIp),
      // The client going away, or SIGTERM: like long polls, this must not hold a deploy up.
      signal: AbortSignal.any([c.req.raw.signal, options.shutdownSignal]),
    });
    return c.newResponse(answer.body, answer);
  });

  return router;
}
