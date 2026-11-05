/**
 * What Scheduling needs from a calendar provider, and no more. Reads return only busy intervals:
 * no client method can hand back an event's title, attendees or description.
 */
import type { Interval } from "../engine/intervals.ts";

export type CalendarErrorKind = "auth" | "rate_limited" | "transient" | "permanent";

export class CalendarError extends Error {
  readonly kind: CalendarErrorKind;
  readonly code: string;
  readonly retryAfterSeconds: number | undefined;
  readonly status: number | undefined;

  constructor(
    kind: CalendarErrorKind,
    code: string,
    message: string,
    opts: { retryAfterSeconds?: number; status?: number } = {},
  ) {
    super(message);
    this.name = "CalendarError";
    this.kind = kind;
    this.code = code;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.status = opts.status;
  }
}

export type RemoteCalendar = {
  externalId: string;
  name: string | null;
  primary: boolean;
  writable: boolean;
};

/** What's written to a host's calendar. By default, deliberately little: a neutral title and a time. */
export type CalendarEventWrite = {
  /** Stable for this booking, host and calendar: retries of a lost response can't duplicate. */
  key: string;
  title: string;
  /** Plain text. `null` clears what an earlier write put there; left out, it's left alone. */
  description?: string | null;
  startMs: number;
  endMs: number;
  conference: "google_meet" | "microsoft_teams" | "zoom" | null;
  location: string | null;
};

export type CalendarEventWritten = { providerEventId: string; meetingUrl: string | null };

export type CalendarEventState =
  | { state: "present"; startMs: number; endMs: number }
  | { state: "deleted" };

export type CalendarChannel = {
  channelId: string;
  resourceId: string | null;
  expiresAtMs: number | null;
};

export interface CalendarClient {
  listCalendars(): Promise<RemoteCalendar[]>;
  /**
   * Every requested calendar that was read has a key; a calendar that errored has none, so a
   * failure can never read as "free".
   */
  fetchBusy(input: {
    calendarIds: readonly string[];
    fromMs: number;
    toMs: number;
  }): Promise<Record<string, Interval[]>>;
  /** Leaves the event as asked, even if a lost attempt already made it. */
  createEvent(calendarId: string, event: CalendarEventWrite): Promise<CalendarEventWritten>;
  updateEvent(
    calendarId: string,
    providerEventId: string,
    event: CalendarEventWrite,
  ): Promise<CalendarEventWritten>;
  /** Succeeds if it's already gone. */
  deleteEvent(calendarId: string, providerEventId: string): Promise<void>;
  /** Deletes what a lost create made. Succeeds if there's nothing. */
  deleteEventByKey(calendarId: string, key: string): Promise<void>;
  /** Null when the provider can't tell, as CalDAV here can't. */
  getEvent?(calendarId: string, providerEventId: string): Promise<CalendarEventState | null>;
  /** Absent when the provider has no push notifications. */
  subscribe?(input: {
    calendarId: string;
    webhookUrl: string;
    token: string;
    ttlSeconds: number;
  }): Promise<CalendarChannel>;
  unsubscribe?(input: { channelId: string; resourceId: string | null }): Promise<void>;
}

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Maps an HTTP failure to what the worker should do about it. */
export function errorFromStatus(
  status: number,
  code: string,
  retryAfter?: string | null,
): CalendarError {
  const seconds = retryAfter ? Number(retryAfter) : undefined;
  const opts = {
    status,
    ...(seconds && Number.isFinite(seconds) ? { retryAfterSeconds: seconds } : {}),
  };
  if (status === 401)
    return new CalendarError("auth", code, "The calendar refused our access.", opts);
  if (status === 429) return new CalendarError("rate_limited", code, "Rate limited.", opts);
  if (status >= 500) return new CalendarError("transient", code, `Provider error ${status}.`, opts);
  return new CalendarError("permanent", code, `Provider refused the request (${status}).`, opts);
}

/** Splits a range into contiguous chunks: a one-minute gap between them could hide a meeting. */
export function chunkRange(fromMs: number, toMs: number, maxDays: number): [number, number][] {
  const chunks: [number, number][] = [];
  const max = maxDays * 86_400_000;
  for (let start = fromMs; start < toMs; start += max) {
    chunks.push([start, Math.min(start + max, toMs)]);
  }
  return chunks;
}
