"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const POLL_MS = 5000;

/** Refreshes the page when the open ticket changes; a half-written reply is client state, so it stays. */
export function TicketLiveUpdates(props: { feedUrl: string; lastMessageId: string | null }) {
  const router = useRouter();
  const seen = useRef(props.lastMessageId);
  seen.current = props.lastMessageId;
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(props.feedUrl, { cache: "no-store" });
        if (!response.ok) return;
        const feed = (await response.json()) as { lastMessageId: string | null };
        if (feed.lastMessageId !== seen.current) router.refresh();
      } catch {
        // The next poll tries again.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [props.feedUrl, router]);
  return null;
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role=listbox],[role=menu],[role=dialog]") !== null
  );
}

/** j/k through the queue, r to reply, n to note, e to resolve. */
export function DeskKeyboard(props: { hrefs: string[]; currentHref: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "j" || event.key === "k") {
        const index = props.currentHref ? props.hrefs.indexOf(props.currentHref) : -1;
        const next = props.hrefs[event.key === "j" ? index + 1 : Math.max(index - 1, 0)];
        if (next && next !== props.currentHref) router.push(next);
      } else if (event.key === "r" || event.key === "n") {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("support:compose", { detail: event.key === "r" ? "reply" : "note" }),
        );
      } else if (event.key === "e") {
        document.getElementById("support-resolve")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.hrefs, props.currentHref, router]);
  return null;
}
