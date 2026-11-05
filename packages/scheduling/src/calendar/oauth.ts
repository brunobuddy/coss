/** OAuth for calendar access: coss.com's apps or a customer's own, PKCE, and refresh. */
import { createHash, randomBytes } from "node:crypto";
import { CalendarError, type HttpFetch } from "./client.ts";

export type OAuthProvider = "google" | "microsoft" | "zoom";

export type OAuthApp = {
  clientId: string;
  clientSecret: string;
  /** Microsoft only. Unset: `common`, which a single-tenant app can't use. */
  tenantId?: string | null | undefined;
};

/** The provider refused the app itself, rather than one host's access. */
export const APP_REFUSED = "app_refused";
const APP_ERRORS = new Set(["invalid_client", "deleted_client"]);

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAtMs: number;
};

// Only what's used: reading busy times (never titles), writing events on calendars the host owns,
// and finding which calendars there are.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export const MICROSOFT_SCOPES = ["Calendars.ReadWrite", "offline_access", "User.Read"];

const ENDPOINTS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    revoke: "https://oauth2.googleapis.com/revoke",
    scopes: GOOGLE_SCOPES,
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    revoke: null,
    scopes: MICROSOFT_SCOPES,
  },
  // Zoom's scopes are set on the app itself, not asked for here.
  zoom: {
    authorize: "https://zoom.us/oauth/authorize",
    token: "https://zoom.us/oauth/token",
    revoke: "https://zoom.us/oauth/revoke",
    scopes: [],
  },
} as const;

const inTenant = (url: string, app: OAuthApp) =>
  url.replace("{tenant}", encodeURIComponent(app.tenantId || "common"));

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizationUrl(input: {
  provider: OAuthProvider;
  app: OAuthApp;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const endpoints = ENDPOINTS[input.provider];
  const params = new URLSearchParams({
    client_id: input.app.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (endpoints.scopes.length > 0) params.set("scope", endpoints.scopes.join(" "));
  if (input.provider === "google") {
    params.set("access_type", "offline");
    // Without this Google omits the refresh token after the first consent.
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "false");
  } else if (input.provider === "microsoft") {
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
  }
  return `${inTenant(endpoints.authorize, input.app)}?${params}`;
}

const basicAuth = (app: OAuthApp) =>
  `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;

async function tokenRequest(
  provider: OAuthProvider,
  app: OAuthApp,
  body: Record<string, string>,
  fetcher: HttpFetch,
  nowMs: number,
): Promise<OAuthTokens> {
  const res = await fetcher(inTenant(ENDPOINTS[provider].token, app), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(provider === "zoom" ? { authorization: basicAuth(app) } : {}),
    },
    body: new URLSearchParams(
      provider === "zoom"
        ? body
        : { client_id: app.clientId, client_secret: app.clientSecret, ...body },
    ).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    // A wrong or deleted secret says nothing about any host, and every one of them would get an email.
    // Not `unauthorized_client`: Microsoft answers that for one tenant that doesn't allow the app.
    if (json.error && APP_ERRORS.has(json.error)) {
      throw new CalendarError("transient", APP_REFUSED, "The provider refused this OAuth app.");
    }
    // A refresh token that's revoked or expired needs the host back; anything else may pass.
    if (json.error === "invalid_grant" || res.status === 400 || res.status === 401) {
      throw new CalendarError(
        "auth",
        json.error ?? "token_refused",
        "Calendar access was refused.",
      );
    }
    throw new CalendarError("transient", json.error ?? "token_failed", "Token request failed.");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAtMs: nowMs + (json.expires_in ?? 3600) * 1000,
  };
}

export function exchangeCode(input: {
  provider: OAuthProvider;
  app: OAuthApp;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetcher: HttpFetch;
  nowMs: number;
}): Promise<OAuthTokens> {
  return tokenRequest(
    input.provider,
    input.app,
    {
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    },
    input.fetcher,
    input.nowMs,
  );
}

export async function refreshTokens(input: {
  provider: OAuthProvider;
  app: OAuthApp;
  refreshToken: string;
  fetcher: HttpFetch;
  nowMs: number;
}): Promise<OAuthTokens> {
  const tokens = await tokenRequest(
    input.provider,
    input.app,
    { grant_type: "refresh_token", refresh_token: input.refreshToken },
    input.fetcher,
    input.nowMs,
  );
  // Providers may not rotate it: keep the one we have.
  return { ...tokens, refreshToken: tokens.refreshToken ?? input.refreshToken };
}

/** Best effort: disconnecting succeeds whether or not the provider hears about it. */
export async function revokeToken(
  provider: OAuthProvider,
  token: string,
  fetcher: HttpFetch,
  app?: OAuthApp | null,
): Promise<void> {
  const url = ENDPOINTS[provider].revoke;
  if (!url) return;
  await fetcher(`${url}?token=${encodeURIComponent(token)}`, {
    method: "POST",
    ...(provider === "zoom" && app ? { headers: { authorization: basicAuth(app) } } : {}),
  }).catch(() => {});
}
