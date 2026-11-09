import { afterEach, describe, expect, test } from "bun:test";
import { type BrowserSdk, initBrowserMonitoring, startBrowserMonitoring } from "../src/browser.ts";
import { SENTRY_TUNNEL_PATH } from "../src/tunnel.ts";

const CONFIG = {
  dsn: "https://abc123@o42.ingest.us.sentry.io/4507",
  environment: "production",
  tracesSampleRate: 0.1,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answers the tunnel's configuration request with `respond()`; records the URLs asked for. */
function serveConfig(respond: () => Response): string[] {
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return respond();
  }) as typeof fetch;
  return urls;
}

/** A fake SDK, and how often it was loaded, started and told about navigations. */
function fakeSdk() {
  const calls = { loads: 0, inits: [] as unknown[], transitions: [] as string[] };
  const sdk: BrowserSdk = {
    init: (options) => calls.inits.push(options),
    browserTracingIntegration: () => ({ name: "BrowserTracing" }),
    captureRouterTransitionStart: (href, type) => calls.transitions.push(`${type} ${href}`),
  };
  const load = async () => {
    calls.loads++;
    return sdk;
  };
  return { calls, load };
}

describe("browser monitoring", () => {
  test("loads and starts the SDK only once the configuration arrives", async () => {
    const urls = serveConfig(() => Response.json(CONFIG));
    const { calls, load } = fakeSdk();
    const sdk = await initBrowserMonitoring(load, "web");
    expect(sdk).toBeDefined();
    expect(urls).toEqual([SENTRY_TUNNEL_PATH]);
    expect(calls.loads).toBe(1);
    expect(calls.inits).toHaveLength(1);
    expect(calls.inits[0]).toMatchObject({ dsn: CONFIG.dsn, tunnel: SENTRY_TUNNEL_PATH });
  });

  test("reports only errors from scripts of the page's own origin", async () => {
    serveConfig(() => Response.json(CONFIG));
    const { calls, load } = fakeSdk();
    const location = Object.getOwnPropertyDescriptor(globalThis, "location");
    Object.defineProperty(globalThis, "location", {
      value: { origin: "https://coss.com" },
      configurable: true,
    });
    try {
      await initBrowserMonitoring(load, "site");
    } finally {
      if (location) Object.defineProperty(globalThis, "location", location);
      else Reflect.deleteProperty(globalThis, "location");
    }
    expect(calls.inits[0]).toMatchObject({
      allowUrls: ["https://coss.com/"],
      ignoreErrors: expect.arrayContaining([
        "Object Not Found Matching Id",
        "Failed to execute 'writeText' on 'Clipboard'",
      ]),
    });
  });

  test("never loads the SDK while monitoring is off or unreachable", async () => {
    for (const respond of [
      () => new Response(null, { status: 404 }),
      () => Response.json({ dsn: 1 }),
      () => {
        throw new TypeError("network down");
      },
    ]) {
      serveConfig(respond);
      const { calls, load } = fakeSdk();
      expect(await initBrowserMonitoring(load, "site")).toBeUndefined();
      expect(calls.loads).toBe(0);
    }
  });

  test("a chunk that fails to load leaves monitoring off", async () => {
    serveConfig(() => Response.json(CONFIG));
    const load = () => Promise.reject(new Error("ChunkLoadError"));
    expect(await initBrowserMonitoring(load, "web")).toBeUndefined();
  });

  test("the router hook is a no-op until the SDK has started", async () => {
    serveConfig(() => Response.json(CONFIG));
    const { calls, load } = fakeSdk();
    const onRouterTransitionStart = startBrowserMonitoring(load, "web");
    onRouterTransitionStart("/early", "push");
    await Bun.sleep(0);
    await Bun.sleep(0);
    onRouterTransitionStart("/acme", "push");
    expect(calls.transitions).toEqual(["push /acme"]);
  });
});
