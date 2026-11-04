/*
 * The checks of the SDK's `verifyWebhook` (packages/sdk/src/webhooks.ts), each reporting its own
 * failure, for the verifier tool. The site can't use the SDK at runtime, and a thrown message
 * wouldn't say what to fix. `test/tools.test.ts` checks the two agree.
 */

export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  | { ok: true; matched: string }
  | {
      ok: false;
      reason: "missing" | "timestamp" | "secret" | "malformed" | "mismatch";
      message: string;
    };

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function checkWebhookSignature({
  body,
  id,
  timestamp,
  signatures,
  secret,
  now = new Date(),
  ignoreAge = false,
}: {
  body: string;
  id: string;
  timestamp: string;
  signatures: string;
  secret: string;
  now?: Date;
  /** For replaying an old request: its age is reported as fine. */
  ignoreAge?: boolean;
}): Promise<SignatureResult> {
  if (!id || !timestamp || !signatures) {
    return {
      ok: false,
      reason: "missing",
      message: "A request needs webhook-id, webhook-timestamp and webhook-signature.",
    };
  }
  if (!/^\d+$/.test(timestamp)) {
    return {
      ok: false,
      reason: "timestamp",
      message: "webhook-timestamp must be whole seconds since the epoch.",
    };
  }
  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!ignoreAge && age > DEFAULT_TOLERANCE_SECONDS) {
    return {
      ok: false,
      reason: "timestamp",
      message: `The timestamp is ${age} seconds from now, past the ${DEFAULT_TOLERANCE_SECONDS}-second tolerance. A verifier would reject this request even with a matching signature.`,
    };
  }
  const keyBytes = decodeBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (!keyBytes || keyBytes.length === 0) {
    return {
      ok: false,
      reason: "secret",
      message: "The secret isn't valid: it should be whsec_ followed by base64.",
    };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  let wellFormed = false;
  for (const candidate of signatures.trim().split(/\s+/)) {
    const [version, value] = candidate.split(",", 2);
    if (version !== "v1" || !value) continue;
    const signature = decodeBase64(value);
    if (!signature) continue;
    wellFormed = true;
    if (await crypto.subtle.verify("HMAC", key, signature, signed)) {
      return { ok: true, matched: candidate };
    }
  }
  if (!wellFormed) {
    return {
      ok: false,
      reason: "malformed",
      message: "webhook-signature should hold space-separated v1,<base64> signatures.",
    };
  }
  return {
    ok: false,
    reason: "mismatch",
    message:
      "No signature matches. Check it's this endpoint's secret, and that the body is the raw request, not parsed and re-serialized JSON.",
  };
}
