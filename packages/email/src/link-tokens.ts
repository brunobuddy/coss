/**
 * Tokens of the links in marketing email: the preference center and unsubscribe links, and
 * double opt-in confirmations. Stateless and encrypted (AES-256-GCM): nothing is written when an
 * email is sent, links keep working after the email is purged, and the address never appears in a
 * URL that scanners, proxies and logs see.
 *
 * `EMAIL_LINK_KEYS` is a key ring like `WEBHOOK_SECRETS_KEY`: comma-separated 32-byte base64 keys,
 * newest first. The first encrypts; every key decrypts, chosen by the id in the token. Retire a
 * key only once its links may be ignored: preference links never expire (keep old keys for at
 * least two years; CAN-SPAM requires unsubscribe links to work for 30 days).
 *
 * Format: `a` (version) + key id (11 characters) + base64url(iv ‖ ciphertext ‖ tag). The kind of
 * link (`p` preferences, `c` confirmation) is authenticated data, so one can't pass as the other.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { withoutTrailingSlashes } from "@coss/db/url";

const VERSION = "a";
const KEY_ID_LENGTH = 11;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/**
 * The largest payload, in bytes: a 254-character address (up to 4 bytes a character, or 2 once
 * JSON-escaped), a 256-character topic, the ids, the time and the JSON around them.
 */
const MAX_PAYLOAD_BYTES = 254 * 4 + 256 + 200;
/** Longer tokens are refused before any decryption; every valid payload fits. */
export const MAX_LINK_TOKEN_LENGTH =
  VERSION.length + KEY_ID_LENGTH + Math.ceil(((IV_BYTES + MAX_PAYLOAD_BYTES + TAG_BYTES) * 4) / 3);
/** Confirmation links expire; preference links never do. */
export const CONFIRMATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LinkKey = { id: string; key: Buffer };

/** The parsed `EMAIL_LINK_KEYS`. */
export type LinkKeyRing = { primary: LinkKey; keys: readonly LinkKey[] };

export type LinkKind = "preferences" | "confirmation";

/** What a link says, in the clear once decrypted. */
export type LinkPayload = {
  kind: LinkKind;
  environmentId: string;
  /** Bare, lower-cased. */
  address: string;
  /** The email the link was in, if any (broadcast stats count its unsubscribes). */
  emailId: string | null;
  /** The topic the email was about: one-click unsubscribes leave just that topic. */
  topic: string | null;
  issuedAt: Date;
};

/** A key's public name: 8 bytes of a domain-separated SHA-256, base64url. */
export function linkKeyId(key: Buffer): string {
  return createHash("sha256")
    .update("coss email link key id\0")
    .update(key)
    .digest()
    .subarray(0, 8)
    .toString("base64url");
}

/** A key ring from raw 32-byte keys, newest first. */
export function linkKeyRing(keys: readonly Buffer[]): LinkKeyRing {
  const ring = keys.map((key) => {
    if (key.length !== 32) throw new Error("EMAIL_LINK_KEYS keys must be 32 bytes, base64.");
    return { id: linkKeyId(key), key };
  });
  const [primary] = ring;
  if (!primary) throw new Error("EMAIL_LINK_KEYS needs at least one key.");
  if (new Set(ring.map((entry) => entry.id)).size !== ring.length) {
    throw new Error("EMAIL_LINK_KEYS lists the same key twice.");
  }
  return { primary, keys: ring };
}

/** Parses `EMAIL_LINK_KEYS`: comma-separated 32-byte base64 keys, newest first. */
export function parseLinkKeys(value: string): LinkKeyRing {
  return linkKeyRing(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Buffer.from(part, "base64")),
  );
}

/** Development and tests only: a fixed, public key (production requires `EMAIL_LINK_KEYS`). */
export const DEVELOPMENT_LINK_KEYS: LinkKeyRing = linkKeyRing([
  createHash("sha256").update("coss development email link key").digest(),
]);

const KIND_CODE: Record<LinkKind, string> = { preferences: "p", confirmation: "c" };

function aad(kind: LinkKind, keyId: string): Buffer {
  return Buffer.from(`coss-link:${KIND_CODE[kind]}:${VERSION}${keyId}`, "utf8");
}

type Wire = { e: string; a: string; m?: string; t?: string; i: number };

/** Encrypts a link's payload with the ring's primary key. */
export function mintLinkToken(
  keys: LinkKeyRing,
  payload: Omit<LinkPayload, "issuedAt"> & { issuedAt?: Date },
): string {
  const { id, key } = keys.primary;
  const wire: Wire = {
    e: payload.environmentId,
    a: payload.address,
    ...(payload.emailId ? { m: payload.emailId } : {}),
    ...(payload.topic ? { t: payload.topic } : {}),
    i: Math.floor((payload.issuedAt ?? new Date()).getTime() / 1000),
  };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(payload.kind, id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(wire), "utf8"), cipher.final()]);
  return `${VERSION}${id}${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64url")}`;
}

/**
 * The payload of a token of `kind`, or `null` for anything else: malformed, tampered with, of
 * another kind, made with a key no longer in the ring, or (confirmations) expired.
 */
export function readLinkToken(
  keys: LinkKeyRing,
  token: string,
  kind: LinkKind,
  now: Date = new Date(),
): LinkPayload | null {
  if (token.length > MAX_LINK_TOKEN_LENGTH || !token.startsWith(VERSION)) return null;
  const keyId = token.slice(VERSION.length, VERSION.length + KEY_ID_LENGTH);
  const entry = keys.keys.find((candidate) => candidate.id === keyId);
  if (!entry) return null;
  const body = Buffer.from(token.slice(VERSION.length + KEY_ID_LENGTH), "base64url");
  if (body.length <= IV_BYTES + TAG_BYTES) return null;
  let wire: Wire;
  try {
    const decipher = createDecipheriv("aes-256-gcm", entry.key, body.subarray(0, IV_BYTES));
    decipher.setAAD(aad(kind, entry.id));
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
    wire = JSON.parse(
      Buffer.concat([
        decipher.update(body.subarray(IV_BYTES, body.length - TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8"),
    ) as Wire;
  } catch {
    return null;
  }
  if (typeof wire.e !== "string" || typeof wire.a !== "string" || typeof wire.i !== "number") {
    return null;
  }
  const issuedAt = new Date(wire.i * 1000);
  if (kind === "confirmation" && now.getTime() - issuedAt.getTime() > CONFIRMATION_LINK_TTL_MS) {
    return null;
  }
  return {
    kind,
    environmentId: wire.e,
    address: wire.a,
    emailId: typeof wire.m === "string" ? wire.m : null,
    topic: typeof wire.t === "string" ? wire.t : null,
    issuedAt,
  };
}

/** Where the preference center lives: under the tracking host, so customer domains serve it. */
export const PREFERENCES_PATH_PREFIX = "/t/u/";

/** The longest header value SES sends (as for customer headers, `HEADER_VALUE` in `schemas.ts`). */
export const MAX_HEADER_VALUE_LENGTH = 995;

export type PreferenceLinks = {
  preferencesUrl: string;
  unsubscribeUrl: string;
  /**
   * RFC 2369 + RFC 8058: mailbox providers show an unsubscribe button and POST to it. Its link
   * leaves out the email (stats only) and then the topic (a one-click unsubscribe from all
   * marketing then) when the full one is too long for a header; `null` when even that is (a very
   * long address), so only the body links remain.
   */
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": string } | null;
};

/**
 * The preference center and unsubscribe links of one recipient. `baseUrl` is the email's tracking
 * origin (a custom tracking domain when active).
 */
export function preferenceLinks(input: {
  baseUrl: string;
  keys: LinkKeyRing;
  environmentId: string;
  address: string;
  emailId?: string | null;
  topic?: string | null;
}): PreferenceLinks {
  const base = withoutTrailingSlashes(input.baseUrl);
  const urlOf = (payload: { emailId: string | null; topic: string | null }) =>
    `${base}${PREFERENCES_PATH_PREFIX}${mintLinkToken(input.keys, {
      kind: "preferences",
      environmentId: input.environmentId,
      address: input.address.toLowerCase(),
      ...payload,
    })}`;
  const full = { emailId: input.emailId ?? null, topic: input.topic ?? null };
  const preferencesUrl = urlOf(full);
  let headerUrl: string | null = preferencesUrl;
  for (const payload of [
    { ...full, emailId: null },
    { emailId: null, topic: null },
  ]) {
    if (`<${headerUrl}>`.length <= MAX_HEADER_VALUE_LENGTH) break;
    headerUrl = urlOf(payload);
  }
  if (`<${headerUrl}>`.length > MAX_HEADER_VALUE_LENGTH) headerUrl = null;
  return {
    preferencesUrl,
    unsubscribeUrl: `${preferencesUrl}/unsubscribe`,
    headers: headerUrl
      ? {
          "List-Unsubscribe": `<${headerUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : null,
  };
}

/** A double opt-in confirmation link (expires after `CONFIRMATION_LINK_TTL_MS`). */
export function confirmationLink(input: {
  baseUrl: string;
  keys: LinkKeyRing;
  environmentId: string;
  address: string;
  issuedAt?: Date;
}): string {
  const token = mintLinkToken(input.keys, {
    kind: "confirmation",
    environmentId: input.environmentId,
    address: input.address.toLowerCase(),
    emailId: null,
    topic: null,
    issuedAt: input.issuedAt,
  });
  return `${withoutTrailingSlashes(input.baseUrl)}${PREFERENCES_PATH_PREFIX}confirm/${token}`;
}
