/**
 * `coss/scheduling`: embeds coss.com's hosted scheduling pages in your app. Create a session on your
 * server, pass its `url` to the browser, and mount it:
 *
 * ```ts
 * import { mountBooker } from "coss/scheduling";
 *
 * const booker = mountBooker({
 *   url: session.url,
 *   container: document.getElementById("booking")!,
 *   onEvent: (event) => {
 *     if (event.type === "booked") showThanks(event.booking_id);
 *   },
 * });
 * ```
 *
 * The page's origin must be in your scheduling settings' `allowed_origins`. The iframe grows with
 * its content unless you give it a `height`. Events are only accepted from the iframe itself, from
 * the hosted app's origin. Browser-only; never throws for what the page reports (it calls `onEvent`).
 */

/** The protocol version of the messages below. */
export const SCHEDULING_MESSAGE_VERSION = 1;

/** What the booker and manage pages tell your app. Ids and statuses only, never a person's details. */
export type BookerEvent =
  | { type: "ready" }
  /** Booked; `status` is `pending_approval` if the event type requires approval. */
  | { type: "booked"; booking_id: string; status: string }
  | { type: "rescheduled"; booking_id: string }
  | { type: "cancelled"; booking_id: string }
  /** The link is invalid or expired (`code` says why). */
  | { type: "error"; code: string; message: string };

/** What the host portal tells your app. */
export type HostPortalEvent =
  | { type: "ready" }
  | { type: "availability_saved" }
  | { type: "calendar_connected" }
  | { type: "error"; code: string; message: string };

/** What a team page tells your app. */
export type TeamPortalEvent =
  | { type: "ready" }
  | { type: "reassignment_started"; reassignment_id: string }
  | { type: "error"; code: string; message: string };

export interface MountOptions<Event> {
  /** A session's `url`. */
  url: string;
  /** Where the iframe goes: it fills the container's width. */
  container: HTMLElement;
  onEvent?: (event: Event) => void;
  /** A fixed CSS height (e.g. `"80vh"`); default: the page's own height as it changes. */
  height?: string;
  /** The iframe's accessible title. */
  title?: string;
}

export interface SchedulingEmbed {
  readonly iframe: HTMLIFrameElement;
  /** Removes the iframe and stops listening. */
  destroy(): void;
}

type Message = { source: "coss-scheduling"; version: number; type: string; [key: string]: unknown };

function isMessage(data: unknown): data is Message {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === "coss-scheduling" &&
    typeof (data as { type?: unknown }).type === "string"
  );
}

function mount<Event>(options: MountOptions<Event>, defaultTitle: string): SchedulingEmbed {
  const origin = new URL(options.url).origin;
  const iframe = options.container.ownerDocument.createElement("iframe");
  iframe.src = options.url;
  iframe.title = options.title ?? defaultTitle;
  // The URL's fragment holds the session token: never send the page's address anywhere.
  iframe.referrerPolicy = "no-referrer";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.height = options.height ?? "640px";
  options.container.appendChild(iframe);

  const view = options.container.ownerDocument.defaultView;
  const listener = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== origin) return;
    if (!isMessage(event.data)) return;
    const { source: _source, version: _version, ...rest } = event.data;
    if (rest.type === "resize") {
      if (!options.height && typeof rest.height === "number" && rest.height > 0) {
        iframe.style.height = `${Math.ceil(rest.height)}px`;
      }
      return;
    }
    options.onEvent?.(rest as Event);
  };
  view?.addEventListener("message", listener);
  return {
    iframe,
    destroy() {
      view?.removeEventListener("message", listener);
      iframe.remove();
    },
  };
}

/** Mounts the booking page of a booker session, or the page of a manage session. */
export function mountBooker(options: MountOptions<BookerEvent>): SchedulingEmbed {
  return mount(options, "Book a time");
}

/** Mounts a team page: who's away, bookings that need cover, and moving them. */
export function mountTeamPortal(options: MountOptions<TeamPortalEvent>): SchedulingEmbed {
  return mount(options, "Team cover");
}

/** Mounts a host's page for their hours, calendars and bookings. */
export function mountHostPortal(options: MountOptions<HostPortalEvent>): SchedulingEmbed {
  return mount(options, "Your availability");
}
