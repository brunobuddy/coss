/** What the product commands share: `--limit`, times, a dim header row, flags' values. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Coss } from "coss";
import { pairs } from "../args.ts";
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

/**
 * A live key's sends reach people and some deletes can't be undone: a terminal confirms, anything
 * else must pass `--yes`.
 */
export async function confirmLive(
  context: Context,
  apiKey: string,
  yes: boolean | undefined,
  question: string,
  declined = "Nothing was sent.",
): Promise<boolean> {
  if (yes || !apiKey.startsWith("coss_live_")) return true;
  if (!context.io.stdinIsTTY) {
    throw new UsageError(`${question} This is a live key: pass --yes to go ahead.`);
  }
  const answer = await context.io.prompt(`${question} This is a live key. Type yes to go ahead: `);
  if (answer.trim().toLowerCase() === "yes") return true;
  context.out.info(declined);
  return false;
}

/** `✔ Deleted <id>`, or the API's answer with `--json`. */
export function printDeleted(out: Output, data: { id: string }, verb = "Deleted"): void {
  if (out.json) out.data(data);
  else out.line(`${out.style("green", "✔")} ${verb} ${data.id}`);
}

/** The API's answer with `--json`, else what `print` makes of it. */
export function printOne<T>(out: Output, data: T, print: (out: Output, data: T) => void): void {
  if (out.json) out.data(data);
  else print(out, data);
}

/** A whole number from a flag. */
export function integerOf(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === "" || !Number.isInteger(number)) {
    throw new UsageError(`${flag} takes a whole number.`);
  }
  return number;
}

/** A number from a flag. */
export function numberOf(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number)) {
    throw new UsageError(`${flag} takes a number.`);
  }
  return number;
}

/** The word `word` clears a setting (`--sms-from default`, `--uid none`). */
export function orNull(value: string, word = "default"): string | null {
  return value === word ? null : value;
}

/** A pair of opposite flags (`--enabled`, `--disabled`): which one, if any. */
export function eitherOf(
  on: boolean | undefined,
  off: boolean | undefined,
  flags: readonly [string, string],
): boolean | undefined {
  if (on && off) throw new UsageError(`Pass ${flags[0]} or ${flags[1]}, not both.`);
  if (on) return true;
  return off ? false : undefined;
}

/** A repeatable `name=value` flag as an object, or nothing when it wasn't given. */
export function pairsOf(
  values: string[] | undefined,
  flag: string,
): Record<string, string> | undefined {
  return values ? Object.fromEntries(pairs(values, flag)) : undefined;
}

/** A file named by a flag, relative to where the command runs. */
export async function fileText(context: Context, flag: string, file: string): Promise<string> {
  try {
    return await readFile(resolve(context.io.cwd, file), "utf8");
  } catch {
    throw new UsageError(`Couldn't read ${file} (${flag}).`);
  }
}

/**
 * A secret, never from a flag (command lines are visible to other local processes): a terminal
 * asks without echoing it, anything else pipes it to stdin.
 */
export async function secretInput(context: Context, what: string, flag: string): Promise<string> {
  const { io } = context;
  const value = io.stdinIsTTY
    ? await io.prompt(`${what}: `, { secret: true })
    : await io.readStdin();
  const secret = value.trim();
  if (!secret) throw new UsageError(`${flag} reads ${what} from stdin, and there was none.`);
  return secret;
}
