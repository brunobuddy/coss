/**
 * Log filters and the search syntax the dashboard's search box speaks. Client-safe (no database):
 *
 *   level:error status:5xx method:POST route:/v1/emails path:/v1/domains key:key_… type:email.bounced
 *   source:email request:req_… resource:email_… recipient:user@example.com -type:email.opened
 *   "free text"
 *
 * Repeating a key ORs its values; `-key:value` excludes. Anything else is free text.
 */
import {
  LOG_LEVELS,
  LOG_SOURCES,
  type LogLevel,
  type LogSource,
  STATUS_FILTER,
} from "./schemas.ts";

export type LogFilters = {
  sources?: LogSource[];
  levels?: LogLevel[];
  types?: string[];
  /** Exact codes (`404`) or classes (`4xx`). */
  statuses?: string[];
  methods?: string[];
  routes?: string[];
  /** Path prefixes. */
  paths?: string[];
  apiKeyIds?: string[];
  requestId?: string;
  resourceId?: string;
  recipient?: string;
  /** Free text (case-insensitive substring). */
  text?: string;
  /** Values to leave out. */
  exclude?: {
    sources?: LogSource[];
    levels?: LogLevel[];
    types?: string[];
    statuses?: string[];
    methods?: string[];
    routes?: string[];
  };
};

type ListKey = "sources" | "levels" | "types" | "statuses" | "methods" | "routes";
type ExcludableKey = keyof NonNullable<LogFilters["exclude"]>;

/** Search keys and the filter each one sets (aliases included). */
export const LOG_QUERY_KEYS = {
  source: "sources",
  level: "levels",
  type: "types",
  event: "types",
  status: "statuses",
  method: "methods",
  route: "routes",
  path: "paths",
  key: "apiKeyIds",
  request: "requestId",
  resource: "resourceId",
  email: "resourceId",
  id: "resourceId",
  recipient: "recipient",
  to: "recipient",
} as const satisfies Record<string, keyof Omit<LogFilters, "text" | "exclude">>;

export type LogQueryKey = keyof typeof LOG_QUERY_KEYS;

/** The keys the search box suggests, with a hint each. */
export const LOG_QUERY_SUGGESTIONS: readonly { key: LogQueryKey; hint: string }[] = [
  { key: "level", hint: "info, warning, error" },
  { key: "source", hint: "api, email, webhook" },
  { key: "status", hint: "200, 4xx, 5xx" },
  { key: "method", hint: "GET, POST, PATCH, DELETE" },
  { key: "route", hint: "/v1/emails/:id" },
  { key: "path", hint: "path prefix" },
  { key: "type", hint: "api.request, email.bounced, webhook.attempt…" },
  { key: "key", hint: "API key id" },
  { key: "request", hint: "req_…" },
  { key: "resource", hint: "email_…, dom_…, whep_…" },
  { key: "recipient", hint: "user@example.com" },
];

const WHITESPACE = /\s/;
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;
const KEY_PREFIX = /^-?[a-z]+:/i;
// Longer than any key, so a long word costs the same as a short one.
const MAX_KEY_PREFIX = 64;

/** The closing quote of the string opening at `open`, or -1. */
function closingQuote(input: string, open: number): number {
  for (let at = open + 1; at < input.length; at++) {
    if (input[at] === '"') return at;
    if (input[at] !== "\\") continue;
    at++;
    if (at >= input.length || LINE_TERMINATOR.test(input[at] as string)) return -1;
  }
  return -1;
}

/** Words and `"quoted strings"`, optionally `key:"quoted"`. By hand, so unclosed quotes stay linear. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let at = 0;
  // Once one string runs off the end, later ones would too: don't scan again for each.
  let unclosed = false;
  while (at < input.length) {
    if (WHITESPACE.test(input[at] as string)) {
      at++;
      continue;
    }
    const prefix = KEY_PREFIX.exec(input.slice(at, at + MAX_KEY_PREFIX))?.[0] ?? "";
    const open = input[at + prefix.length] === '"' ? at + prefix.length : at;
    const close = input[open] === '"' && !unclosed ? closingQuote(input, open) : -1;
    if (close !== -1) {
      const body = input.slice(open + 1, close).replace(/\\(.)/g, "$1");
      tokens.push(`${open === at ? "" : prefix}${body}`);
      at = close + 1;
      continue;
    }
    if (input[open] === '"') unclosed = true;
    let end = at + 1;
    while (end < input.length && !WHITESPACE.test(input[end] as string)) end++;
    tokens.push(input.slice(at, end));
    at = end;
  }
  return tokens;
}

function normalizeValue(key: LogQueryKey, value: string): string | null {
  switch (key) {
    case "source":
      return (LOG_SOURCES as readonly string[]).includes(value.toLowerCase())
        ? value.toLowerCase()
        : null;
    case "level": {
      const level = value.toLowerCase() === "warn" ? "warning" : value.toLowerCase();
      return (LOG_LEVELS as readonly string[]).includes(level) ? level : null;
    }
    case "status":
      return STATUS_FILTER.test(value.toLowerCase()) ? value.toLowerCase() : null;
    case "method":
      return /^[a-z]{3,7}$/i.test(value) ? value.toUpperCase() : null;
    case "recipient":
    case "to":
      return value.toLowerCase();
    default:
      return value;
  }
}

function pushUnique(list: string[] | undefined, value: string): string[] {
  const out = list ?? [];
  if (!out.includes(value)) out.push(value);
  return out;
}

/** Parses the search box. Unknown keys and invalid values stay in the free text. */
export function parseLogQuery(input: string): LogFilters {
  const filters: LogFilters = {};
  const text: string[] = [];
  for (const token of tokenize(input)) {
    const match = /^(-?)([a-z]+):(.+)$/i.exec(token);
    const key = match?.[2]?.toLowerCase();
    if (!match || key === undefined || !(key in LOG_QUERY_KEYS)) {
      text.push(token);
      continue;
    }
    const queryKey = key as LogQueryKey;
    const value = normalizeValue(queryKey, match[3] ?? "");
    if (value === null) {
      text.push(token);
      continue;
    }
    const target = LOG_QUERY_KEYS[queryKey];
    const negated = match[1] === "-";
    if (negated) {
      if (!isExcludable(target)) {
        text.push(token);
        continue;
      }
      filters.exclude ??= {};
      (filters.exclude as Record<string, string[]>)[target] = pushUnique(
        filters.exclude[target] as string[] | undefined,
        value,
      );
    } else if (target === "requestId" || target === "resourceId" || target === "recipient") {
      filters[target] = value;
    } else {
      (filters as Record<string, string[]>)[target] = pushUnique(
        filters[target] as string[] | undefined,
        value,
      );
    }
  }
  const free = text.join(" ").trim();
  if (free.length > 0) filters.text = free;
  return filters;
}

function isExcludable(key: string): key is ExcludableKey {
  return ["sources", "levels", "types", "statuses", "methods", "routes"].includes(key);
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

const KEY_FOR: Record<ListKey | "paths" | "apiKeyIds", LogQueryKey> = {
  sources: "source",
  levels: "level",
  types: "type",
  statuses: "status",
  methods: "method",
  routes: "route",
  paths: "path",
  apiKeyIds: "key",
};

/** The inverse of `parseLogQuery` (canonical keys, stable order). */
export function formatLogQuery(filters: LogFilters): string {
  const parts: string[] = [];
  for (const [field, key] of Object.entries(KEY_FOR) as [keyof typeof KEY_FOR, LogQueryKey][]) {
    for (const value of (filters[field] as string[] | undefined) ?? []) {
      parts.push(`${key}:${quote(value)}`);
    }
  }
  if (filters.requestId) parts.push(`request:${quote(filters.requestId)}`);
  if (filters.resourceId) parts.push(`resource:${quote(filters.resourceId)}`);
  if (filters.recipient) parts.push(`recipient:${quote(filters.recipient)}`);
  for (const [field, values] of Object.entries(filters.exclude ?? {})) {
    const key = KEY_FOR[field as ListKey];
    for (const value of (values as string[] | undefined) ?? []) {
      parts.push(`-${key}:${quote(value)}`);
    }
  }
  if (filters.text) parts.push(filters.text);
  return parts.join(" ");
}

/** True when any filter (or free text) is set. */
export function hasLogFilters(filters: LogFilters): boolean {
  return formatLogQuery(filters).length > 0;
}

/** `[min, max)` status codes for a `4xx`/`404` filter. */
export function statusRange(filter: string): [number, number] {
  if (filter.endsWith("xx")) {
    const base = Number(filter[0]) * 100;
    return [base, base + 100];
  }
  const code = Number(filter);
  return [code, code + 1];
}

/** The status class (`2xx`…) of a code. */
export function statusClass(code: number): string {
  return `${Math.floor(code / 100)}xx`;
}

/** Relative ranges the dashboard offers, in ms. */
export const LOG_RANGE_PRESETS = [
  { id: "15m", label: "Last 15 minutes", ms: 15 * 60 * 1000 },
  { id: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { id: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { id: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "3d", label: "Last 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { id: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export type LogRangePreset = (typeof LOG_RANGE_PRESETS)[number]["id"];
