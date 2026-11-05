import type { LogLevel, LogSource } from "@coss/logs/schemas";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** `OCT 11`, `08:56:22`, `.74` in UTC (server and client render the same text). */
export function logTimeParts(iso: string): { day: string; time: string; fraction: string } {
  const date = new Date(iso);
  return {
    day: `${MONTHS[date.getUTCMonth()]} ${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
    fraction: `.${pad(Math.floor(date.getUTCMilliseconds() / 10))}`,
  };
}

/** `2026-10-11 08:56:22.742 UTC`. */
export function logTimestamp(iso: string): string {
  const date = new Date(iso);
  return `${iso.slice(0, 10)} ${logTimeParts(iso).time}.${pad(date.getUTCMilliseconds(), 3)} UTC`;
}

/** Short axis labels for a histogram bucket, precise enough for its size. */
export function axisLabel(iso: string, bucketMs: number): string {
  const { day, time } = logTimeParts(iso);
  if (bucketMs >= 24 * 3_600_000) return day;
  if (bucketMs >= 3_600_000) return `${day} ${time.slice(0, 5)}`;
  if (bucketMs >= 60_000) return time.slice(0, 5);
  return time;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
}

export const LEVEL_DOT: Record<LogLevel, string> = {
  info: "bg-muted-foreground/40",
  warning: "bg-warning",
  error: "bg-destructive",
};

export const LEVEL_BAR: Record<LogLevel, string> = {
  info: "fill-muted-foreground/35",
  warning: "fill-warning",
  error: "fill-destructive",
};

export const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

export const SOURCE_LABEL: Record<LogSource, string> = {
  api: "API request",
  email: "Email event",
  webhook: "Webhook",
  risk: "Risk",
  smtp: "SMTP message",
  sms: "SMS event",
  sign: "Signature event",
  verify: "Verification",
  forms: "Form submission",
  scheduling: "Booking",
};

/** Text color for a status code (2xx green, 3xx blue, 4xx amber, 5xx red). */
export function statusClassName(code: number | null): string {
  if (code === null) return "text-muted-foreground";
  if (code >= 500) return "text-destructive-foreground";
  if (code >= 400) return "text-warning-foreground";
  if (code >= 300) return "text-info-foreground";
  return "text-success-foreground";
}

/** Count labels: `1.2k`. */
export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value / 100_000) / 10}M`;
}
