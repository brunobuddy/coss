import type { Subaccount } from "coss";
import { z } from "zod";
import { respond } from "../result.ts";
import {
  compact,
  cursorSchema,
  DESTRUCTIVE,
  given,
  limitSchema,
  nextCursor,
  READ_ONLY,
  type ToolContext,
  WRITE,
} from "./shared.ts";

function subaccountSummary(subaccount: Subaccount): object {
  return compact({
    id: subaccount.id,
    uid: subaccount.uid,
    name: subaccount.name,
    status: subaccount.status,
    reputation: subaccount.reputation.status,
    reputation_trigger: subaccount.reputation.trigger,
    quotas: subaccount.quotas,
    created_at: subaccount.created_at,
  });
}

const quotas = z
  .object({
    recipients_per_day: z.number().int().nullable().optional(),
    recipients_per_second: z.number().int().nullable().optional(),
    burst: z.number().int().nullable().optional(),
  })
  .optional()
  .describe("Recipient quotas. Fields left out keep their value; `null` removes one.");

export function registerSubaccountTools(ctx: ToolContext): void {
  const { server, coss } = ctx;
  const subaccount = z
    .string()
    .describe("The sub-account's id or your own uid. list_subaccounts finds it.");

  server.registerTool(
    "list_subaccounts",
    {
      title: "List sub-accounts",
      description:
        "Email for platforms: your users, each with their own domains, suppressions, quotas and " +
        "reputation. `reputation: paused` means its live sends are refused until you reinstate it.",
      inputSchema: z.object({ limit: limitSchema(20), cursor: cursorSchema }),
      annotations: READ_ONLY,
    },
    ({ cursor, limit }) =>
      respond(coss.email.subaccounts.list(given({ limit, after: cursor })), (page) => ({
        subaccounts: page.data.map(subaccountSummary),
        next_cursor: nextCursor(page),
      })),
  );

  server.registerTool(
    "get_subaccount",
    {
      title: "Get a sub-account",
      description: "One sub-account with its status, quotas, reputation and metadata.",
      inputSchema: z.object({ subaccount }),
      annotations: READ_ONLY,
    },
    (args) => respond(coss.email.subaccounts.get(args.subaccount)),
  );

  server.registerTool(
    "create_subaccount",
    {
      title: "Create a sub-account",
      description:
        "Creates a sub-account for one of your users. A `uid` of your own lets you address it " +
        "without storing its id.",
      inputSchema: z.object({
        name: z.string(),
        uid: z.string().optional().describe("Your own id for it, unique in the environment."),
        metadata: z.record(z.string(), z.string()).optional(),
        quotas,
      }),
      annotations: WRITE,
    },
    (args) => respond(coss.email.subaccounts.create(given(args)), subaccountSummary),
  );

  server.registerTool(
    "update_subaccount",
    {
      title: "Update a sub-account",
      description:
        "Changes the fields given. `status: disabled` refuses its sends until it is `active` " +
        "again. `metadata` replaces the whole object.",
      inputSchema: z.object({
        subaccount,
        name: z.string().optional(),
        uid: z.string().nullable().optional().describe("`null` removes it."),
        metadata: z.record(z.string(), z.string()).optional(),
        status: z.enum(["active", "disabled"]).optional(),
        quotas,
      }),
      annotations: WRITE,
    },
    ({ subaccount: ref, ...args }) =>
      respond(coss.email.subaccounts.update(ref, given(args)), subaccountSummary),
  );

  server.registerTool(
    "delete_subaccount",
    {
      title: "Delete a sub-account",
      description:
        "Deletes the sub-account: its sends stop and its domains are released in the background " +
        "(`status: deleting`). It can't be undone.",
      inputSchema: z.object({ subaccount }),
      annotations: DESTRUCTIVE,
    },
    (args) => respond(coss.email.subaccounts.delete(args.subaccount), subaccountSummary),
  );

  server.registerTool(
    "reinstate_subaccount",
    {
      title: "Reinstate a sub-account",
      description:
        "Lifts a `paused` reputation, so its live sends are accepted again. Bounces or complaints " +
        "that paused it can pause it again; check get_subaccount_stats first.",
      inputSchema: z.object({ subaccount }),
      annotations: WRITE,
    },
    (args) => respond(coss.email.subaccounts.reinstate(args.subaccount), subaccountSummary),
  );

  server.registerTool(
    "get_subaccount_stats",
    {
      title: "Get a sub-account's stats",
      description:
        "Its sending per UTC day (at most the last 45 days): recipients, sent, delivered, " +
        "bounced, complained, failed and suppressed.",
      inputSchema: z.object({
        subaccount,
        from: z
          .string()
          .optional()
          .describe("First day, YYYY-MM-DD. Default: 30 days before `to`."),
        to: z.string().optional().describe("Last day, YYYY-MM-DD, included. Default: today."),
      }),
      annotations: READ_ONLY,
    },
    ({ subaccount: ref, ...args }) => respond(coss.email.subaccounts.stats(ref, given(args))),
  );
}
