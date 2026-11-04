import type { CallToolResult } from "@modelcontextprotocol/server";
import type { CossError, CossResult } from "coss";
import { InvalidArgumentError } from "./tools/shared.ts";

/** Bodies and other free text are cut to this many characters unless a tool asks for more. */
export const DEFAULT_TEXT_LIMIT = 4000;

/** A tool's answer: JSON text for the model, plus the same object as structured content. */
export function ok(data: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** What to try next for an error, in the agent's terms. */
function hintFor(error: CossError): string | undefined {
  switch (error.type) {
    case "authentication_error":
      return "The API key was refused. Check COSS_API_KEY (coss_live_… or coss_test_…) and that the key wasn't revoked.";
    case "not_found_error":
      return (
        "Nothing with that id exists in this API key's environment. Emails, SMS messages, " +
        "suppressions, received messages and webhook endpoints belong to one environment: a " +
        "sandbox (coss_test_) key can't see live ones, and a live key can't see sandbox ones."
      );
    case "permission_error":
      if (error.code === "hipaa_mode_restriction") {
        return "The organization's HIPAA mode refuses this, and no key changes that. Don't work around it: tell the user what was refused.";
      }
      return error.code === "insufficient_permissions"
        ? "The API key is restricted and lacks the permission named in the message " +
            "(get_account_status lists what it holds). Ask the user for a key with that permission."
        : "Sending or changes are refused for the organization; call get_account_status for its reputation and billing standing.";
    case "billing_error":
      return "A billing hold or the plan's limits refused this; call get_account_status.";
    case "rate_limit_error":
      return "Rate limited by the coss.com API. Wait a little before calling again.";
    case "invalid_request_error":
      return error.issues?.length
        ? "Fix the parameters listed in `issues` and call again."
        : undefined;
    case "connection_error":
    case "timeout_error":
      return "The coss.com API could not be reached. Check the network and COSS_BASE_URL (unset means https://api.coss.com).";
    default:
      return undefined;
  }
}

/** A failed API call as a tool error the agent can act on. */
export function fail(error: CossError): CallToolResult {
  const hint = error.hint ?? hintFor(error);
  const body = {
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
      status: error.status,
      request_id: error.request_id,
      ...(error.param ? { param: error.param } : {}),
      ...(error.issues?.length ? { issues: error.issues } : {}),
    },
    ...(hint ? { hint } : {}),
  };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

/** A tool error that isn't an API error (bad combination of arguments, nothing found…). */
export function failWith(message: string, details: object = {}): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { message }, ...details }, null, 2) }],
  };
}

/** Thrown by `unwrap` so one tool can chain several calls and fail on the first error. */
export class CossCallError extends Error {
  readonly error: CossError;
  constructor(error: CossError) {
    super(error.message);
    this.error = error;
  }
}

export function unwrap<T>(result: CossResult<T>): T {
  if (result.error) throw new CossCallError(result.error);
  return result.data;
}

/** Runs a tool body: API errors raised by `unwrap` become tool errors. */
export async function run(body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof CossCallError) return fail(error.error);
    if (error instanceof InvalidArgumentError) return failWith(error.message);
    throw error;
  }
}

/** One API call whose data is the answer. */
export async function respond<T extends object>(
  call: Promise<CossResult<T>>,
  shape: (data: T) => object = (data) => data,
): Promise<CallToolResult> {
  const result = await call;
  return result.error ? fail(result.error) : ok(shape(result.data));
}

/** Cuts free text (bodies, response excerpts) so one tool call can't flood the context. */
export function truncate(text: string | null, limit: number = DEFAULT_TEXT_LIMIT): string | null {
  if (text === null || text.length <= limit) return text;
  return `${text.slice(0, limit)}… [truncated: ${text.length - limit} more characters]`;
}
