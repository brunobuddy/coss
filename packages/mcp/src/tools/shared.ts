import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import type { Coss } from "coss";
import { z } from "zod";

/** Whether the server's API key is a live or a sandbox key (from its prefix). */
export type KeyMode = "live" | "sandbox" | "unknown";

export interface ToolContext {
  server: McpServer;
  coss: Coss;
  mode: KeyMode;
  /** Overrides `Date.now()` (tests). */
  now: () => Date;
  /**
   * Directory walked for the project env file (`create_webhook_endpoint` writes
   * `COSS_WEBHOOK_SECRET` there). Default: the process working directory.
   */
  projectDir: string;
}

/** Looks things up; changes nothing. */
export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };

/** Creates or changes something in coss.com; nothing is lost. */
export const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Removes something, or stops something from happening. */
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

/** Reaches people outside: an email, a text, or a notification they get because of it. */
export const SENDS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const limitSchema = (fallback: number): z.ZodDefault<z.ZodNumber> =>
  z.number().int().min(1).max(100).default(fallback).describe("How many to return (1-100).");

export const cursorSchema: z.ZodOptional<z.ZodString> = z
  .string()
  .optional()
  .describe("`next_cursor` from the previous page.");

export const timeSchema = (what: string): z.ZodOptional<z.ZodString> =>
  z
    .string()
    .optional()
    .describe(`${what}: an ISO 8601 time, or how long ago, like "30m", "2h", "7d".`);

const AGO = /^(\d+)\s*(m|min|h|d|w)$/i;
const UNIT_MS: Record<string, number> = {
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** `"2h"` (two hours ago) or an ISO 8601 time; throws on anything else. */
export function parseTime(value: string, now: Date): Date {
  const ago = AGO.exec(value.trim());
  if (ago) {
    const unit = UNIT_MS[(ago[2] ?? "").toLowerCase()] ?? 0;
    return new Date(now.getTime() - Number(ago[1]) * unit);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidArgumentError(
      `"${value}" is not a time: use ISO 8601 (2026-10-15T09:00:00Z) or "30m", "2h", "7d".`,
    );
  }
  return date;
}

/** A tool argument that is well-typed but unusable; becomes a tool error. */
export class InvalidArgumentError extends Error {}

/** The cursor of the next page: the last item's id while there are more. */
export function nextCursor(list: { data: { id: string }[]; has_more: boolean }): string | null {
  return list.has_more ? (list.data.at(-1)?.id ?? null) : null;
}

/** Drops `null`s and empty arrays at the top level: less for the model to read. */
export function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0),
    ),
  ) as Partial<T>;
}

/** The arguments without the ones left out, for the SDK's exact optional parameters. */
export function given<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/** The key's environment kind, from its prefix. */
export function keyMode(apiKey: string | undefined): KeyMode {
  if (apiKey?.startsWith("coss_live_")) return "live";
  if (apiKey?.startsWith("coss_test_")) return "sandbox";
  return "unknown";
}
