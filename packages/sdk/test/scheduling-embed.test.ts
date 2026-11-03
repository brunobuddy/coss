import { describe, expect, test } from "bun:test";
import { mountBooker, mountHostPortal } from "../src/scheduling.ts";

function fakeDocument() {
  const listeners = new Map<string, (event: unknown) => void>();
  const view = {
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const iframe = {
    style: {} as Record<string, string>,
    contentWindow: {},
    remove: () => {},
  } as unknown as HTMLIFrameElement & { src: string; title: string; referrerPolicy: string };
  const container = {
    ownerDocument: { createElement: () => iframe, defaultView: view },
    appendChild: () => {},
  } as unknown as HTMLElement;
  return { iframe, container, listeners };
}

const URL_WITH_TOKEN = "https://book.example.test/b/schs_1#cossch_token";
const message = (body: object) => ({ source: "coss-scheduling", version: 1, ...body });

describe("coss/scheduling", () => {
  test("never sends the page's address, which holds the token", () => {
    const { iframe, container } = fakeDocument();
    mountBooker({ url: URL_WITH_TOKEN, container });
    expect(iframe.referrerPolicy).toBe("no-referrer");
    expect(iframe.src).toBe(URL_WITH_TOKEN);
    expect(iframe.title).toBe("Book a time");
  });

  test("takes events only from its own iframe, at the app's origin", () => {
    const { iframe, container, listeners } = fakeDocument();
    const events: unknown[] = [];
    mountBooker({ url: URL_WITH_TOKEN, container, onEvent: (event) => events.push(event) });
    const send = listeners.get("message") as (event: unknown) => void;
    const body = message({ type: "booked", booking_id: "book_1", status: "confirmed" });
    send({ source: {}, origin: "https://book.example.test", data: body });
    send({ source: iframe.contentWindow, origin: "https://evil.example", data: body });
    send({
      source: iframe.contentWindow,
      origin: "https://book.example.test",
      data: { type: "booked" },
    });
    expect(events).toEqual([]);
    send({ source: iframe.contentWindow, origin: "https://book.example.test", data: body });
    expect(events).toEqual([{ type: "booked", booking_id: "book_1", status: "confirmed" }]);
  });

  test("resizes to fit, unless given a height", () => {
    const a = fakeDocument();
    mountHostPortal({ url: URL_WITH_TOKEN, container: a.container });
    (a.listeners.get("message") as (event: unknown) => void)({
      source: a.iframe.contentWindow,
      origin: "https://book.example.test",
      data: message({ type: "resize", height: 812.4 }),
    });
    expect(a.iframe.style.height).toBe("813px");
    const b = fakeDocument();
    mountHostPortal({ url: URL_WITH_TOKEN, container: b.container, height: "80vh" });
    (b.listeners.get("message") as (event: unknown) => void)({
      source: b.iframe.contentWindow,
      origin: "https://book.example.test",
      data: message({ type: "resize", height: 812 }),
    });
    expect(b.iframe.style.height).toBe("80vh");
  });

  test("destroy stops listening", () => {
    const { container, listeners } = fakeDocument();
    mountBooker({ url: URL_WITH_TOKEN, container }).destroy();
    expect(listeners.size).toBe(0);
  });
});
