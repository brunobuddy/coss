/**
 * Endpoint signing secrets are stored encrypted (AES-256-GCM): they must be reversible to sign
 * requests and to show them to the customer, so they cannot be hashed.
 *
 * `WEBHOOK_SECRETS_KEY` is a key ring: a comma-separated list of keys, newest first. The first
 * encrypts, any of them decrypts, and every ciphertext names the key it was made with
 * (`v2:<key id>:<iv>:<ciphertext>:<tag>`, the `v2:<key id>` prefix authenticated as associated
 * data). Key ids are derived from the keys, so the list needs no labels. Rotating the key:
 * README.md, "Rotating WEBHOOK_SECRETS_KEY". The first upgrade from v1-only readers requires
 * the coordinated cutover in "Upgrading from v1 webhook secret storage" before these writers start.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { decodeSecretsKeys } from "./env.ts";

const VERSION = "v2";
/** Written before key ids existed; decrypted by trying every key until `reencryptWebhookSecrets` rewrites it. */
const LEGACY_VERSION = "v1";

export type SecretsKey = { id: string; key: Buffer };

/** A parsed key ring: `WEBHOOK_SECRETS_KEY`, or another variable of the same form. */
export type SecretsKeyRing = {
  /** The variable it came from, for errors. */
  name: string;
  /** Encrypts every new ciphertext. */
  primary: SecretsKey;
  /** Every key, primary first. */
  keys: readonly SecretsKey[];
};

/** A short public name for a key: 8 bytes of a domain-separated SHA-256, base64url. */
export function secretsKeyId(key: Buffer): string {
  return createHash("sha256")
    .update("coss webhook secrets key id\0")
    .update(key)
    .digest()
    .subarray(0, 8)
    .toString("base64url");
}

/** A key ring from raw 32-byte keys, newest first. */
export function secretsKeyRing(
  keys: readonly Buffer[],
  name = "WEBHOOK_SECRETS_KEY",
): SecretsKeyRing {
  const ring = keys.map((key) => ({ id: secretsKeyId(key), key }));
  const [primary] = ring;
  if (!primary) throw new Error(`${name} needs at least one key.`);
  if (new Set(ring.map((entry) => entry.id)).size !== ring.length) {
    throw new Error(`${name} lists the same key twice.`);
  }
  return { name, primary, keys: ring };
}

/** Parses `WEBHOOK_SECRETS_KEY`: comma-separated 32-byte base64 keys, newest first. */
export function parseSecretsKeys(value: string): SecretsKeyRing {
  return secretsKeyRing(decodeSecretsKeys(value));
}

export function encryptSecret(secret: string, keys: SecretsKeyRing): string {
  const { id, key } = keys.primary;
  const header = `${VERSION}:${id}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(header, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    header,
    ...[iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64")),
  ].join(":");
}

function decryptWith(
  key: Buffer,
  parts: { iv: string; ciphertext: string; tag: string },
  aad?: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts.iv, "base64"));
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(parts.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptSecret(stored: string, keys: SecretsKeyRing): string {
  const parts = stored.split(":");
  if (parts[0] === VERSION && parts.length === 5) {
    const [version, keyId, iv, ciphertext, tag] = parts as [string, string, string, string, string];
    const entry = keys.keys.find((candidate) => candidate.id === keyId);
    if (!entry) {
      throw new Error(`This value was encrypted with key ${keyId}, which is not in ${keys.name}.`);
    }
    return decryptWith(entry.key, { iv, ciphertext, tag }, `${version}:${keyId}`);
  }
  if (parts[0] === LEGACY_VERSION && parts.length === 4) {
    const [, iv, ciphertext, tag] = parts as [string, string, string, string];
    for (const { key } of keys.keys) {
      try {
        return decryptWith(key, { iv, ciphertext, tag });
      } catch {
        // GCM authenticates: a wrong key fails here, so try the next one.
      }
    }
    throw new Error(`No key in ${keys.name} decrypts this value.`);
  }
  throw new Error("Unsupported encrypted value format.");
}

/** Whether `stored` is already encrypted with the ring's primary key. */
export function isEncryptedWithPrimary(stored: string, keys: SecretsKeyRing): boolean {
  return stored.startsWith(`${VERSION}:${keys.primary.id}:`);
}
