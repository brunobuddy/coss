/**
 * Messages to the page embedding these pages (`coss/scheduling`, which checks they come from this
 * origin and this iframe). They carry ids and statuses only. Sent to any origin: only origins in
 * the environment's `allowed_origins` can frame the page at all (`frame-ancestors`), and a page
 * opened on its own has no parent to tell.
 */
export const SCHEDULING_MESSAGE_VERSION = 1;

export type EmbedMessage =
  | { type: "ready" }
  | { type: "booked"; booking_id: string; status: string }
  | { type: "rescheduled"; booking_id: string }
  | { type: "cancelled"; booking_id: string }
  | { type: "availability_saved" }
  | { type: "calendar_connected" }
  | { type: "error"; code: string; message: string }
  | { type: "resize"; height: number };

export function postToHost(message: EmbedMessage): void {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(
    { source: "coss-scheduling", version: SCHEDULING_MESSAGE_VERSION, ...message },
    "*",
  );
}

/** Tells the host the content's height whenever it changes, so the iframe can fit it. */
export function reportHeight(): () => void {
  if (typeof window === "undefined" || window.parent === window) return () => {};
  const content = document.querySelector("[data-embed-content]") ?? document.body;
  let last = 0;
  const observer = new ResizeObserver(() => {
    const height = Math.ceil(content.getBoundingClientRect().height);
    if (Math.abs(height - last) < 2) return;
    last = height;
    postToHost({ type: "resize", height });
  });
  observer.observe(content);
  return () => observer.disconnect();
}
