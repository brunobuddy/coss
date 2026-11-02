/**
 * CalDAV (Apple, Nextcloud, Fastmail and others) with an app password. The server is a URL the host
 * typed, so every request goes through a transport that refuses private addresses, and every
 * redirect is checked again. There's no push in CalDAV: the worker polls.
 */
import http from "node:http";
import https from "node:https";
import { publicAddressLookup } from "@coss/webhooks";
import { XMLParser } from "fast-xml-parser";
import { type Interval, normalizeIntervals } from "../engine/intervals.ts";
import {
  type CalendarClient,
  CalendarError,
  type CalendarEventWrite,
  type CalendarEventWritten,
  chunkRange,
  errorFromStatus,
  type RemoteCalendar,
} from "./client.ts";
import { buildIcs, busyFromIcs } from "./ical.ts";

export type DavRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type DavResponse = { status: number; headers: Record<string, string>; body: string };

export type DavTransport = (request: DavRequest) => Promise<DavResponse>;

const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_RANGE_DAYS = 90;

/** Requests pinned to an address checked to be public, so DNS can't rebind between check and use. */
export function pinnedDavTransport(opts: { allowPrivateNetworks?: boolean } = {}): DavTransport {
  const lookup = publicAddressLookup(opts);
  return (request) =>
    new Promise<DavResponse>((resolve, reject) => {
      const url = new URL(request.url);
      if (url.protocol !== "https:" && !opts.allowPrivateNetworks) {
        reject(new CalendarError("permanent", "insecure_url", "CalDAV servers must use https."));
        return;
      }
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(
        url,
        { method: request.method, headers: request.headers, lookup, timeout: TIMEOUT_MS },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              req.destroy(new Error("Response too large."));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () => {
            const headers: Record<string, string> = {};
            for (const [name, value] of Object.entries(res.headers)) {
              if (typeof value === "string") headers[name] = value;
            }
            resolve({
              status: res.statusCode ?? 0,
              headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("Timed out.")));
      req.on("error", reject);
      req.end(request.body);
    });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  isArray: (name) => name === "response" || name === "propstat" || name === "comp",
});

type Propstat = { status?: string; prop?: Record<string, unknown> };
type DavEntry = { href?: string; propstat?: Propstat[] };

function entriesOf(xml: string): DavEntry[] {
  const parsed = parser.parse(xml) as { multistatus?: { response?: DavEntry[] } };
  return parsed.multistatus?.response ?? [];
}

function propOf(entry: DavEntry): Record<string, unknown> {
  const ok = entry.propstat?.find((item) => !item.status || / 200 /.test(item.status));
  return ok?.prop ?? {};
}

function hrefOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "href" in value) {
    const href = (value as { href: unknown }).href;
    return typeof href === "string" ? href : null;
  }
  return null;
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]);
  }
  return null;
}

/** Whether a calendar collection stores events, not just tasks. */
function acceptsEvents(prop: Record<string, unknown>): boolean {
  const set = prop["supported-calendar-component-set"] as
    | { comp?: { "@_name"?: string }[] }
    | undefined;
  if (!set?.comp) return true;
  return set.comp.some((comp) => comp["@_name"] === "VEVENT");
}

const PROPFIND_PRINCIPAL = `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
const PROPFIND_HOME = `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
const PROPFIND_CALENDARS = `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><d:current-user-privilege-set/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

function queryBody(fromMs: number, toMs: number): string {
  const stamp = (ms: number) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  return `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(fromMs)}" end="${stamp(toMs)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

export function caldavCalendarClient(input: {
  url: string;
  username: string;
  password: string;
  transport: DavTransport;
  /** The clock for `DTSTAMP`. */
  now?: () => number;
}): CalendarClient {
  const authorization = `Basic ${Buffer.from(`${input.username}:${input.password}`, "utf8").toString("base64")}`;
  const now = input.now ?? Date.now;

  const send = async (
    request: Omit<DavRequest, "headers"> & { headers?: Record<string, string> },
  ) => {
    let url = request.url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response: DavResponse;
      try {
        response = await input.transport({
          ...request,
          url,
          headers: { authorization, ...request.headers },
        });
      } catch (error) {
        if (error instanceof CalendarError) throw error;
        throw new CalendarError("transient", "unreachable", "The CalDAV server didn't answer.");
      }
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, url);
        // The password goes only where the host told us to send it.
        if (next.origin !== new URL(url).origin && !isKnownMove(url, next)) {
          throw new CalendarError(
            "permanent",
            "redirected_away",
            "The server redirected elsewhere.",
          );
        }
        url = next.toString();
        continue;
      }
      return { ...response, url };
    }
    throw new CalendarError("permanent", "too_many_redirects", "Too many redirects.");
  };

  const fail = (status: number, code: string, headers: Record<string, string>) => {
    if (status === 401 || status === 403) {
      return new CalendarError("auth", code, "The server refused these credentials.", { status });
    }
    return errorFromStatus(status, code, headers["retry-after"]);
  };

  const discover = async (): Promise<RemoteCalendar[]> => {
    const propfind = (url: string, body: string, depth: "0" | "1") =>
      send({
        url,
        method: "PROPFIND",
        headers: { depth, "content-type": "application/xml; charset=utf-8" },
        body,
      });
    const root = await propfind(input.url, PROPFIND_PRINCIPAL, "0");
    if (root.status !== 207) throw fail(root.status, "discovery_failed", root.headers);
    const principalHref = hrefOf(propOf(entriesOf(root.body)[0] ?? {})["current-user-principal"]);
    if (!principalHref) {
      throw new CalendarError("permanent", "no_principal", "This server has no calendar account.");
    }
    const principal = await propfind(
      new URL(principalHref, root.url).toString(),
      PROPFIND_HOME,
      "0",
    );
    if (principal.status !== 207)
      throw fail(principal.status, "discovery_failed", principal.headers);
    const homeHref = hrefOf(propOf(entriesOf(principal.body)[0] ?? {})["calendar-home-set"]);
    if (!homeHref) {
      throw new CalendarError("permanent", "no_home", "This account has no calendars.");
    }
    const homeUrl = new URL(homeHref, principal.url);
    const home = await propfind(homeUrl.toString(), PROPFIND_CALENDARS, "1");
    if (home.status !== 207) throw fail(home.status, "discovery_failed", home.headers);
    const calendars: RemoteCalendar[] = [];
    for (const entry of entriesOf(home.body)) {
      const prop = propOf(entry);
      const type = prop.resourcetype as Record<string, unknown> | undefined;
      if (!entry.href || !type || !("calendar" in type) || !acceptsEvents(prop)) continue;
      calendars.push({
        externalId: new URL(entry.href, homeUrl).toString(),
        name: textOf(prop.displayname),
        primary: calendars.length === 0,
        writable: true,
      });
    }
    return calendars;
  };

  const eventUrl = (calendarId: string, name: string) =>
    new URL(
      `${encodeURIComponent(name)}.ics`,
      calendarId.endsWith("/") ? calendarId : `${calendarId}/`,
    ).toString();

  const eventIcs = (event: CalendarEventWrite) =>
    buildIcs({
      uid: event.key,
      title: event.title,
      startMs: event.startMs,
      endMs: event.endMs,
      stampMs: now(),
      location: event.location,
      private: true,
    });

  return {
    listCalendars: discover,

    async fetchBusy({ calendarIds, fromMs, toMs }) {
      const result: Record<string, Interval[]> = {};
      for (const calendarId of calendarIds) {
        const intervals: Interval[] = [];
        let ok = true;
        for (const [from, to] of chunkRange(fromMs, toMs, MAX_RANGE_DAYS)) {
          const response = await send({
            url: calendarId,
            method: "REPORT",
            headers: { depth: "1", "content-type": "application/xml; charset=utf-8" },
            body: queryBody(from, to),
          });
          if (response.status === 401 || response.status === 403) {
            throw fail(response.status, "report_refused", response.headers);
          }
          // A deleted calendar must not read as free: it's left out of the result.
          if (response.status !== 207) {
            ok = false;
            break;
          }
          for (const entry of entriesOf(response.body)) {
            const data = textOf(propOf(entry)["calendar-data"]);
            if (data) intervals.push(...busyFromIcs(data, from, to));
          }
        }
        if (ok) result[calendarId] = normalizeIntervals(intervals);
      }
      return result;
    },

    async createEvent(calendarId, event): Promise<CalendarEventWritten> {
      const url = eventUrl(calendarId, event.key);
      const response = await send({
        url,
        method: "PUT",
        // Only if absent: a retry after a lost answer finds it, and doesn't make another.
        headers: { "if-none-match": "*", "content-type": "text/calendar; charset=utf-8" },
        body: eventIcs(event),
      });
      if (response.status === 412 || (response.status >= 200 && response.status < 300)) {
        return { providerEventId: event.key, meetingUrl: null };
      }
      throw fail(response.status, "create_failed", response.headers);
    },

    async updateEvent(calendarId, providerEventId, event): Promise<CalendarEventWritten> {
      const url = eventUrl(calendarId, providerEventId);
      const response = await send({
        url,
        method: "PUT",
        headers: { "content-type": "text/calendar; charset=utf-8" },
        body: eventIcs({ ...event, key: providerEventId }),
      });
      if (response.status >= 200 && response.status < 300) {
        return { providerEventId, meetingUrl: null };
      }
      throw fail(response.status, "update_failed", response.headers);
    },

    async deleteEvent(calendarId, providerEventId) {
      const response = await send({
        url: eventUrl(calendarId, providerEventId),
        method: "DELETE",
      });
      if (response.status === 404 || response.status === 410) return;
      if (response.status >= 200 && response.status < 300) return;
      throw fail(response.status, "delete_failed", response.headers);
    },
  };
}

/** iCloud moves an account to a partition host (`p42-caldav.icloud.com`): the same service. */
function isKnownMove(from: string, to: URL): boolean {
  const icloud = /(^|\.)icloud\.com$/;
  return icloud.test(new URL(from).hostname) && icloud.test(to.hostname);
}
