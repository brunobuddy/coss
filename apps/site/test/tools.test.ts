import { describe, expect, test } from "bun:test";
import { verifyWebhook } from "coss";
import { buildDmarcRecord, readDmarcRecord } from "../src/lib/dmarc";
import { checkWebhookSignature } from "../src/lib/webhook-signature";

const SECRET_BYTES = new TextEncoder().encode("a test secret, thirty-two bytes!");
const SECRET = `whsec_${btoa(String.fromCharCode(...SECRET_BYTES))}`;
const NOW = new Date("2026-11-03T12:00:00Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const BODY = JSON.stringify({ type: "email.delivered" });

async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    SECRET_BYTES,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

describe("webhook signature verifier", () => {
  const request = async (overrides: Partial<Parameters<typeof checkWebhookSignature>[0]> = {}) =>
    checkWebhookSignature({
      body: BODY,
      id: "msg_1",
      timestamp: TIMESTAMP,
      signatures: await sign("msg_1", TIMESTAMP, BODY),
      secret: SECRET,
      now: NOW,
      ...overrides,
    });

  test("agrees with the SDK's verifyWebhook", async () => {
    const signature = await sign("msg_1", TIMESTAMP, BODY);
    const headers = {
      "webhook-id": "msg_1",
      "webhook-timestamp": TIMESTAMP,
      "webhook-signature": signature,
    };
    await expect(verifyWebhook(BODY, headers, SECRET, { now: NOW })).resolves.toBeDefined();
    expect((await request()).ok).toBe(true);

    const altered = `${BODY} `;
    await expect(verifyWebhook(altered, headers, SECRET, { now: NOW })).rejects.toThrow();
    expect(await request({ body: altered })).toMatchObject({ ok: false, reason: "mismatch" });
  });

  test("says what's wrong", async () => {
    expect(await request({ id: "" })).toMatchObject({ reason: "missing" });
    expect(await request({ timestamp: "soon" })).toMatchObject({ reason: "timestamp" });
    expect(await request({ secret: "whsec_%%%" })).toMatchObject({ reason: "secret" });
    expect(await request({ signatures: "v2,abc" })).toMatchObject({ reason: "malformed" });
  });

  test("an old request fails unless its age is ignored", async () => {
    const old = String(Number(TIMESTAMP) - 3600);
    const signatures = await sign("msg_1", old, BODY);
    expect(await request({ timestamp: old, signatures })).toMatchObject({ reason: "timestamp" });
    expect((await request({ timestamp: old, signatures, ignoreAge: true })).ok).toBe(true);
  });

  test("one matching signature among several is enough (a secret being rolled)", async () => {
    const signatures = `v1,AAAA ${await sign("msg_1", TIMESTAMP, BODY)}`;
    expect((await request({ signatures })).ok).toBe(true);
  });
});

describe("DMARC", () => {
  test("builds a record", () => {
    expect(buildDmarcRecord({ policy: "reject", rua: "dmarc@acme.test" })).toBe(
      "v=DMARC1; p=reject; rua=mailto:dmarc@acme.test;",
    );
    expect(
      buildDmarcRecord({ policy: "quarantine", subdomainPolicy: "none", strictAlignment: true }),
    ).toBe("v=DMARC1; p=quarantine; sp=none; adkim=s; aspf=s;");
  });

  test("what it builds reads back with no errors", () => {
    const record = buildDmarcRecord({ policy: "reject", rua: "dmarc@acme.test" });
    expect(readDmarcRecord(record)).toMatchObject({ errors: [], advice: [] });
  });

  test("finds what makes receivers ignore a record", () => {
    expect(readDmarcRecord("p=none; v=DMARC1").errors).toContain(
      "A record must start with v=DMARC1.",
    );
    expect(readDmarcRecord("v=DMARC1").errors).toContain("A record needs a p tag.");
    expect(readDmarcRecord("v=DMARC1; rua=mailto:a@b.test; p=none").errors).toContain(
      "The p tag must come straight after v.",
    );
    expect(readDmarcRecord("v=DMARC1; p=block").errors).toEqual([
      "p: Should be none, quarantine or reject.",
    ]);
    expect(readDmarcRecord("v=DMARC1; p=none; rua=a@b.test").errors).toEqual([
      "rua: Should be comma-separated mailto: addresses.",
    ]);
    expect(readDmarcRecord("v=DMARC1; p=none; p=reject").errors).toContain("p appears twice.");
  });

  test("advises on a valid record that could do more", () => {
    const { errors, advice } = readDmarcRecord('"v=DMARC1; p=none; pct=50"');
    expect(errors).toEqual([]);
    expect(advice).toHaveLength(3);
  });
});
