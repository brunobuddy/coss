/**
 * Browser monitoring for the dashboard and the site (their `instrumentation-client.ts`). Both are
 * served from coss.com, where the dashboard's /api/monitoring hands out the configuration and
 * relays envelopes to Sentry (src/tunnel.ts). Takes the app's SDK instead of importing one, so this
 * package depends on no framework SDK.
 */
import type { Integration } from "@sentry/core";
import type { SentryConfig } from "./config.ts";
import { type SentryService, sentryOptions } from "./options.ts";
import { SENTRY_TUNNEL_PATH } from "./tunnel.ts";

/** What this needs of `@sentry/nextjs` (or any browser SDK). */
export type BrowserSdk = {
  // biome-ignore lint/suspicious/noExplicitAny: each SDK types its own options.
  init(options: any): unknown;
  browserTracingIntegration(): Integration;
  captureRouterTransitionStart(href: string, navigationType: string): void;
};

/** Next's `onRouterTransitionStart` hook (`instrumentation-client.ts`). */
export type RouterTransitionHook = (href: string, navigationType: string) => void;

/**
 * Errors of code that runs as the page itself, so `allowUrls` can't tell it from ours: Outlook's
 * link scanner (Safe Links), extensions' messaging and Telegram's in-app browser.
 */
const FOREIGN_ERRORS = [
  "Object Not Found Matching Id",
  "Invalid call to runtime.sendMessage()",
  "Error invoking postEvent",
];

/**
 * Browsers refusing to write to the clipboard (permissions, policies, a page without focus). Our
 * copy buttons catch it, but libraries' (Fumadocs' code blocks) leave the rejection unhandled, and
 * either way the text stays selectable: nothing to fix.
 */
const CLIPBOARD_REFUSALS = [
  "Failed to execute 'writeText' on 'Clipboard'",
  "Clipboard write was blocked",
];

function isConfig(value: unknown): value is SentryConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.dsn === "string" &&
    typeof config.environment === "string" &&
    typeof config.tracesSampleRate === "number"
  );
}

/**
 * Fetches the configuration, then loads the SDK through `load` (a dynamic import, so the SDK is a
 * chunk of its own that no page waits for) and starts it; does nothing while monitoring is off or
 * the configuration can't be loaded. Errors thrown before it has started (shortly after the page
 * loads) aren't reported. Returns the app's `onRouterTransitionStart`, a no-op until then.
 */
export function startBrowserMonitoring(
  load: () => Promise<BrowserSdk>,
  service: Extract<SentryService, "web" | "site">,
): RouterTransitionHook {
  let started: BrowserSdk | undefined;
  void initBrowserMonitoring(load, service).then((sdk) => {
    started = sdk;
  });
  return (href, navigationType) => started?.captureRouterTransitionStart(href, navigationType);
}

/** Starts the SDK as {@link startBrowserMonitoring} describes; resolves to it once started. */
export async function initBrowserMonitoring(
  load: () => Promise<BrowserSdk>,
  service: Extract<SentryService, "web" | "site">,
): Promise<BrowserSdk | undefined> {
  let config: unknown;
  try {
    const response = await fetch(SENTRY_TUNNEL_PATH, { credentials: "omit" });
    if (!response.ok) return undefined;
    config = await response.json();
  } catch {
    return undefined;
  }
  if (!isConfig(config)) return undefined;
  let sdk: BrowserSdk;
  try {
    sdk = await load();
  } catch {
    return undefined;
  }
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  sdk.init({
    ...sentryOptions(config, service),
    tunnel: SENTRY_TUNNEL_PATH,
    integrations: [sdk.browserTracingIntegration()],
    // Only errors thrown by our own scripts: extensions and other injected code also run in the
    // page (`app:///…`, `chrome-extension://…` frames) and would otherwise be reported as ours.
    ...(origin ? { allowUrls: [`${origin}/`] } : {}),
    ignoreErrors: [...FOREIGN_ERRORS, ...CLIPBOARD_REFUSALS],
  });
  return sdk;
}
