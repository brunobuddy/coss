import type { CossError, CossResult } from "coss";
import { z } from "zod";
import { ok } from "../result.ts";
import { READ_ONLY, type ToolContext } from "./shared.ts";

export function registerAccountTools(ctx: ToolContext): void {
  const { server, coss } = ctx;

  server.registerTool(
    "get_account_status",
    {
      title: "Get account status",
      description:
        "Whether this API key's organization can send: the key's mode (live or sandbox) and " +
        "permissions (full access, or the restricted list it holds), the " +
        "sending reputation (good, warning, suspended, with the bounce/complaint checks behind " +
        "it), billing status and holds on live sending, the plan, and open/click tracking settings.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => {
      const errors: Record<string, Pick<CossError, "type" | "code" | "message">> = {};
      const soft = async <T>(name: string, call: Promise<CossResult<T>>): Promise<T | null> => {
        const result = await call;
        if (!result.error) return result.data;
        errors[name] = {
          type: result.error.type,
          code: result.error.code,
          message: result.error.message,
        };
        return null;
      };
      const [environment, reputation, billing, tracking] = await Promise.all([
        soft("environment", coss.environment.get()),
        soft("reputation", coss.reputation.get()),
        soft("billing", coss.billing.get()),
        soft("tracking", coss.email.tracking.get()),
      ]);
      return ok({
        api_key: {
          mode: ctx.mode,
          note:
            ctx.mode === "sandbox"
              ? "Sandbox key: emails are never delivered and outcomes are simulated."
              : ctx.mode === "live"
                ? "Live key: emails are delivered, from verified domains only."
                : "Unknown key format.",
          ...(environment
            ? { access: environment.api_key.access, permissions: environment.api_key.permissions }
            : {}),
        },
        ...(environment ? { hipaa_mode: environment.organization.hipaa_mode } : {}),
        reputation,
        billing: billing && {
          plan: billing.plan,
          status: billing.status,
          holds: billing.holds,
          scheduled_change: billing.scheduled_change,
          usage: billing.usage,
        },
        tracking,
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
      });
    },
  );
}
