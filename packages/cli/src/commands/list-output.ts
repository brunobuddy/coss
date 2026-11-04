/** What the product commands' lists share: `--limit`, times and a dim header row. */
import type { Coss } from "coss";
import type { Context } from "../context.ts";
import { clientFor, resolveCredentials } from "../context.ts";
import { UsageError } from "../errors.ts";
import type { Output } from "../output.ts";
import { type Cell, table } from "../table.ts";

export const LIMIT = {
  type: "string",
  value: "<n>",
  description: "How many to show, 1-100 (default 20)",
} as const;

export async function client(context: Context): Promise<Coss> {
  return clientFor(context.io, await resolveCredentials(context));
}

export function limitOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new UsageError("--limit takes a number from 1 to 100.");
  }
  return limit;
}

export const when = (iso: string): string => iso.slice(0, 16).replace("T", " ");

export function oneOf<T extends string>(
  flag: string,
  value: string | undefined,
  choices: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!(choices as readonly string[]).includes(value)) {
    throw new UsageError(`${flag} takes ${choices.join(", ")}; got "${value}".`);
  }
  return value as T;
}

/** Items one per line with `--json`; otherwise a table, or `empty` when there are none. */
export function printList<T>(
  out: Output,
  items: readonly T[],
  options: {
    empty: string;
    header: readonly string[];
    row: (item: T) => readonly Cell[];
    more?: string | false;
  },
): void {
  if (out.json) {
    for (const item of items) out.data(item as object);
    return;
  }
  if (items.length === 0) {
    out.info(options.empty);
    return;
  }
  const lines = table([options.header, ...items.map(options.row)], out);
  out.line(out.style("dim", lines[0] ?? ""));
  for (const line of lines.slice(1)) out.line(line);
  if (options.more) out.info(out.style("dim", options.more));
}

/** A key's live sends reach people: a terminal confirms, anything else must pass `--yes`. */
export async function confirmLive(
  context: Context,
  apiKey: string,
  yes: boolean | undefined,
  question: string,
): Promise<boolean> {
  if (yes || !apiKey.startsWith("coss_live_")) return true;
  if (!context.io.stdinIsTTY) {
    throw new UsageError(`${question} This is a live key: pass --yes to go ahead.`);
  }
  const answer = await context.io.prompt(`${question} This is a live key. Type yes to go ahead: `);
  if (answer.trim().toLowerCase() === "yes") return true;
  context.out.info("Nothing was sent.");
  return false;
}
