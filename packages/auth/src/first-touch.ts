/**
 * Where a visitor first came from, kept in their browser until they have an account: the site and
 * the dashboard share coss.com's origin, so both can read it. Only the path of the first page, the
 * host of the referrer and the campaign parameters, never a full URL. Nothing is stored for
 * visitors with Global Privacy Control on. Client-safe, no imports.
 */

export const FIRST_TOUCH_KEY = "coss.first-touch";

/** A visit this old says little about why someone signed up today. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_PATH_LENGTH = 200;
const CAMPAIGN_VALUE = /^[\w.+ -]{1,100}$/;

export type FirstTouch = {
  landingPath: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** ISO 8601. */
  landedAt: string;
};

function campaignValue(value: string | null): string | null {
  return value && CAMPAIGN_VALUE.test(value) ? value : null;
}

/** A visit's first touch. An internal referrer is no referrer: the visit began somewhere else. */
export function firstTouchFrom({
  href,
  referrer,
  now,
}: {
  href: string;
  referrer: string;
  now: Date;
}): FirstTouch {
  const url = new URL(href);
  let referrerHost: string | null = null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host && host !== url.hostname.toLowerCase()) referrerHost = host;
  } catch {
    // Empty or not a URL: a direct visit.
  }
  return {
    landingPath: url.pathname.slice(0, MAX_PATH_LENGTH),
    referrerHost,
    utmSource: campaignValue(url.searchParams.get("utm_source") ?? url.searchParams.get("ref")),
    utmMedium: campaignValue(url.searchParams.get("utm_medium")),
    utmCampaign: campaignValue(url.searchParams.get("utm_campaign")),
    landedAt: now.toISOString(),
  };
}

/** The stored value, or null if it's missing, malformed or too old. */
export function parseStoredFirstTouch(stored: string | null, now: Date): FirstTouch | null {
  if (!stored) return null;
  try {
    const touch = JSON.parse(stored) as FirstTouch;
    if (typeof touch?.landingPath !== "string" || typeof touch.landedAt !== "string") return null;
    const landedAt = Date.parse(touch.landedAt);
    if (Number.isNaN(landedAt) || now.getTime() - landedAt > MAX_AGE_MS) return null;
    return touch;
  } catch {
    return null;
  }
}

/** Storage can throw (private windows, blocked site data): none of this may ever break a page. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps this visit unless an earlier one is already kept. Call once per page load, in an effect. */
export function rememberFirstTouch(): void {
  try {
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    if (gpc) return;
    const store = storage();
    if (!store) return;
    const now = new Date();
    if (parseStoredFirstTouch(store.getItem(FIRST_TOUCH_KEY), now)) return;
    const touch = firstTouchFrom({ href: location.href, referrer: document.referrer, now });
    store.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    // Best effort.
  }
}

export function recallFirstTouch(): FirstTouch | null {
  try {
    return parseStoredFirstTouch(storage()?.getItem(FIRST_TOUCH_KEY) ?? null, new Date());
  } catch {
    return null;
  }
}

export function forgetFirstTouch(): void {
  try {
    storage()?.removeItem(FIRST_TOUCH_KEY);
  } catch {
    // Best effort.
  }
}
