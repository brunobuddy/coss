/**
 * The credentials of a calendar delegation: parsing what a customer pastes, minting a mailbox's
 * access token with them, and telling what a refusal means. No database here.
 *
 * Both are the customer's own: a service account their Workspace admin authorized, or an Entra app
 * in their tenant. The provider confines either to that Workspace or tenant, which is why no one has
 * to prove they own a domain.
 */
import { createPrivateKey, createSign } from "node:crypto";
import { SchedulingError } from "../errors.ts";
import { CalendarError, type HttpFetch } from "./client.ts";
import { GOOGLE_SCOPES, type OAuthTokens } from "./oauth.ts";

export type GoogleDelegationCredentials = {
  kind: "google";
  clientEmail: string;
  clientId: string;
  privateKey: string;
};

export type MicrosoftDelegationCredentials = {
  kind: "microsoft";
  tenantId: string;
  clientId: string;
  clientSecret: string;
};

export type DelegationCredentials = GoogleDelegationCredentials | MicrosoftDelegationCredentials;

// Fixed on purpose: a pasted key's `token_uri` would send the signed assertion wherever it says.
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWT_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const JWT_LIFETIME_SECONDS = 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which permissions an admin grants, to show them what to authorize. */
export const DELEGATION_SCOPES = {
  google: GOOGLE_SCOPES,
  microsoft: ["Calendars.ReadWrite"],
} as const;

const invalid = (message: string, param: string) =>
  new SchedulingError("invalid_calendar_delegation", message, { param });

/** Never quotes what it was given: the value is a private key. */
export function parseServiceAccountKey(value: string): GoogleDelegationCredentials {
  const param = "service_account_key";
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid("This isn't a service account's JSON key.", param);
  }
  const key = parsed as {
    type?: unknown;
    client_email?: unknown;
    client_id?: unknown;
    private_key?: unknown;
  } | null;
  if (key?.type !== "service_account") {
    throw invalid("This isn't a service account's JSON key.", param);
  }
  if (
    typeof key.client_email !== "string" ||
    typeof key.client_id !== "string" ||
    !/^\d+$/.test(key.client_id) ||
    typeof key.private_key !== "string"
  ) {
    throw invalid("This key is missing its client_email, client_id or private_key.", param);
  }
  try {
    createPrivateKey(key.private_key);
  } catch {
    throw invalid("This key's private_key can't be read.", param);
  }
  return {
    kind: "google",
    clientEmail: key.client_email,
    clientId: key.client_id,
    privateKey: key.private_key,
  };
}

export function parseMicrosoftCredentials(input: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): MicrosoftDelegationCredentials {
  // Both end up in a token URL or a form, so nothing but an id gets through.
  if (!UUID.test(input.tenantId)) {
    throw invalid("tenant_id is the Directory (tenant) ID, a UUID.", "tenant_id");
  }
  if (!UUID.test(input.clientId)) {
    throw invalid("client_id is the Application (client) ID, a UUID.", "client_id");
  }
  return { kind: "microsoft", ...input };
}

/** Lowercased, and only an address: it goes in a token's `sub` and in Graph's paths. */
export function normalizeMailbox(value: string): string | null {
  const mailbox = value.trim().toLowerCase();
  return /^[^\s@/\\?#]+@[^\s@/\\?#]+$/.test(mailbox) ? mailbox : null;
}

export const mailboxDomain = (mailbox: string): string => mailbox.split("@")[1] ?? "";

const base64url = (value: string) => Buffer.from(value).toString("base64url");

function googleAssertion(
  credentials: GoogleDelegationCredentials,
  mailbox: string,
  nowMs: number,
): string {
  const iat = Math.floor(nowMs / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: credentials.clientEmail,
      sub: mailbox,
      scope: GOOGLE_SCOPES.join(" "),
      aud: GOOGLE_TOKEN_URL,
      iat,
      exp: iat + JWT_LIFETIME_SECONDS,
    }),
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(credentials.privateKey)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

type TokenAnswer = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function googleRefusal(status: number, answer: TokenAnswer): CalendarError {
  const description = answer.error_description ?? "";
  if (status === 429 || status >= 500) {
    return new CalendarError(
      status === 429 ? "rate_limited" : "transient",
      answer.error ?? "token_failed",
      "Token request failed.",
    );
  }
  if (answer.error === "invalid_grant") {
    // Our clock, or Google's: nothing to do with what the customer set up.
    if (/token must be|iat|exp /i.test(description)) {
      return new CalendarError("transient", "clock_skew", "Token request failed.");
    }
    if (/signature/i.test(description)) {
      return new CalendarError("auth", "invalid_signature", "The service account key was refused.");
    }
    if (/email|user id|account/i.test(description)) {
      return new CalendarError("auth", "mailbox_refused", "Google doesn't know this mailbox.");
    }
  }
  return new CalendarError(
    "auth",
    answer.error ?? "token_refused",
    "Google refused the service account.",
  );
}

function microsoftRefusal(status: number, answer: TokenAnswer): CalendarError {
  if (status === 429 || status >= 500) {
    return new CalendarError(
      status === 429 ? "rate_limited" : "transient",
      answer.error ?? "token_failed",
      "Token request failed.",
    );
  }
  // A token here isn't for anyone in particular, so a refusal is about the app.
  return new CalendarError(
    "auth",
    /AADSTS7000222/.test(answer.error_description ?? "")
      ? "secret_expired"
      : (answer.error ?? "token_refused"),
    "Microsoft refused the app's credentials.",
  );
}

/** A fresh access token for this mailbox. It's refused with `auth` when access was lost. */
export async function mintDelegatedToken(
  credentials: DelegationCredentials,
  mailbox: string,
  deps: { fetcher: HttpFetch; nowMs: number },
): Promise<OAuthTokens> {
  const google = credentials.kind === "google";
  const res = await deps.fetcher(
    google
      ? GOOGLE_TOKEN_URL
      : `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        google
          ? {
              grant_type: GOOGLE_JWT_GRANT,
              assertion: googleAssertion(credentials, mailbox, deps.nowMs),
            }
          : {
              grant_type: "client_credentials",
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
              scope: "https://graph.microsoft.com/.default",
            },
      ).toString(),
    },
  );
  const answer = (await res.json().catch(() => ({}))) as TokenAnswer;
  if (!res.ok || !answer.access_token) {
    throw google ? googleRefusal(res.status, answer) : microsoftRefusal(res.status, answer);
  }
  return {
    accessToken: answer.access_token,
    refreshToken: null,
    expiresAtMs: deps.nowMs + (answer.expires_in ?? JWT_LIFETIME_SECONDS) * 1000,
  };
}

export type DelegationFailureScope = "credentials" | "mailbox" | "ambiguous";

const CREDENTIAL_CODES = new Set([
  "unauthorized_client",
  "invalid_client",
  "access_denied",
  "invalid_signature",
  "invalid_request",
  "invalid_tenant",
  "secret_expired",
  "accessNotConfigured",
]);

const MAILBOX_CODES = new Set([
  "mailbox_refused",
  "no_primary",
  "ErrorInvalidUser",
  "ErrorNonExistentMailbox",
  "MailboxNotEnabledForRESTAPI",
  "MailboxNotSupportedForRESTAPI",
]);

/**
 * Whose problem an `auth` refusal is. A revoked consent and one mailbox outside an access policy
 * both look like 403 from Graph, so `ambiguous` needs another mailbox's answer to settle it.
 */
export function delegationFailureScope(error: CalendarError): DelegationFailureScope {
  if (CREDENTIAL_CODES.has(error.code)) return "credentials";
  if (MAILBOX_CODES.has(error.code)) return "mailbox";
  return "ambiguous";
}

/** Graph's codes for a mailbox that isn't there: a 404 is usually a `permanent` failure. */
export const isMailboxGoneCode = (code: string | undefined): boolean =>
  code !== undefined && MAILBOX_CODES.has(code);
