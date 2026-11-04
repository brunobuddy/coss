import type { Log } from "coss";
import { z } from "zod";
import { ok, respond, run, unwrap } from "../result.ts";
import {
  compact,
  cursorSchema,
  limitSchema,
  nextCursor,
  parseTime,
  READ_ONLY,
  type ToolContext,
  timeSchema,
} from "./shared.ts";

function logLine(log: Log): object {
  return compact({
    id: log.id,
    occurred_at: log.occurred_at,
    source: log.source,
    level: log.level,
    type: log.type,
    message: log.message,
    method: log.method,
    path: log.path,
    status_code: log.status_code,
    error_code: log.error_code,
    request_id: log.request_id,
    resource_id: log.resource_id,
    recipient: log.recipient,
  });
}

export function registerLogTools(ctx: ToolContext): void {
  const { server, coss } = ctx;

  server.registerTool(
    "search_logs",
    {
      title: "Search environment logs",
      description:
        "The environment's logs, newest first: every API request made with its keys (method, " +
        "path, status, error code), every email event and every webhook attempt. Use it for " +
        '"why did my API call fail?" (e.g. route "/v1/emails", status ["4xx"]), then get_log for ' +
        "the request and response bodies. Covers one hour by default, at most 31 days.",
      inputSchema: z.object({
        since: timeSchema("Start of the range (default: an hour before `until`)"),
        until: timeSchema("End of the range (default: now)"),
        source: z
          .array(
            z.enum([
              "api",
              "email",
              "webhook",
              "risk",
              "smtp",
              "sms",
              "sign",
              "verify",
              "forms",
              "scheduling",
            ]),
          )
          .optional(),
        level: z.array(z.enum(["info", "warning", "error"])).optional(),
        type: z
          .array(z.string())
          .optional()
          .describe('Line types, e.g. "api.request", "email.bounced", "webhook.attempt".'),
        status: z
          .array(z.string())
          .optional()
          .describe('HTTP status codes or classes: "4xx", "503".'),
        method: z.array(z.string()).optional(),
        route: z.array(z.string()).optional().describe('API routes, e.g. "/v1/emails/:id".'),
        request_id: z.string().optional().describe("A request's X-Request-Id (req_…)."),
        resource_id: z.string().optional().describe("Lines about this resource, e.g. an email id."),
        query: z
          .string()
          .optional()
          .describe("Free text: message, path, ids, recipient, error code."),
        limit: limitSchema(20),
        cursor: cursorSchema,
      }),
      annotations: READ_ONLY,
    },
    ({ since, until, query, cursor, ...filters }) =>
      run(async () => {
        const now = ctx.now();
        const list = unwrap(
          await coss.logs.list({
            ...filters,
            from: since ? parseTime(since, now) : undefined,
            to: until ? parseTime(until, now) : undefined,
            q: query,
            after: cursor,
          }),
        );
        return ok({ logs: list.data.map(logLine), next_cursor: nextCursor(list) });
      }),
  );

  server.registerTool(
    "get_log",
    {
      title: "Get a log line",
      description:
        "One log line with its attributes: for API requests the (redacted) request and response " +
        "bodies, so you can see exactly what was sent and what the API answered.",
      inputSchema: z.object({ id: z.string().describe("The log id (log_…).") }),
      annotations: READ_ONLY,
    },
    ({ id }) => respond(coss.logs.get(id)),
  );
}
