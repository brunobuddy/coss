import { describe, expect, test } from "bun:test";
import { createCipheriv } from "node:crypto";
import { isBlockedAddress } from "../src/addresses.ts";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedWithPrimary,
  parseSecretsKeys,
  secretsKeyId,
  secretsKeyRing,
} from "../src/secrets.ts";
import {
  createWebhookSender,
  RESPONSE_EXCERPT_BYTES,
  validateWebhookUrl,
  WebhookUrlError,
} from "../src/sender.ts";
import { generateSigningSecret, signatureHeaders, signPayload } from "../src/signing.ts";
import { TEST_SECRETS_KEYS, webhookReceiver } from "../src/testing.ts";

describe("isBlockedAddress", () => {
  test.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    "1.1.1.1",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("signing", () => {
  test("matches the Standard Webhooks reference vector", () => {
    expect(
      signPayload({
        secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        timestamp: 1614265330,
        body: '{"test": 2432232314}',
      }),
    ).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  test("secrets are whsec_ + 32 random bytes", () => {
    const secret = generateSigningSecret();
    expect(secret).toStartWith("whsec_");
    expect(Buffer.from(secret.slice(6), "base64")).toHaveLength(32);
    expect(generateSigningSecret()).not.toBe(secret);
  });
});

describe("secret encryption", () => {
  const oldKey = Buffer.alloc(32, 1);
  const newKey = Buffer.alloc(32, 2);

  test("round-trips, names its key and detects tampering", () => {
    const stored = encryptSecret("whsec_abc", TEST_SECRETS_KEYS);
    expect(stored).toStartWith(`v2:${TEST_SECRETS_KEYS.primary.id}:`);
    expect(stored.split(":")).toHaveLength(5);
    expect(decryptSecret(stored, TEST_SECRETS_KEYS)).toBe("whsec_abc");
    const [version, keyId, iv, , tag] = stored.split(":");
    const forged = [version, keyId, iv, Buffer.from("whsec_xyz").toString("base64"), tag];
    expect(() => decryptSecret(forged.join(":"), TEST_SECRETS_KEYS)).toThrow();
  });

  test("the key id is authenticated", () => {
    // Same key under two ids: relabeling the ciphertext must not decrypt.
    const ring = secretsKeyRing([oldKey]);
    const stored = encryptSecret("whsec_abc", ring);
    const relabeled = stored.replace(ring.primary.id, secretsKeyId(newKey));
    const lying = {
      name: ring.name,
      primary: ring.primary,
      keys: [{ id: secretsKeyId(newKey), key: oldKey }],
    };
    expect(() => decryptSecret(relabeled, lying)).toThrow();
  });

  test("encrypts with the first key and decrypts with any listed key", () => {
    const before = secretsKeyRing([oldKey]);
    const during = secretsKeyRing([newKey, oldKey]);
    const after = secretsKeyRing([newKey]);
    const old = encryptSecret("whsec_old", before);
    const fresh = encryptSecret("whsec_new", during);

    expect(fresh).toStartWith(`v2:${secretsKeyId(newKey)}:`);
    expect(decryptSecret(old, during)).toBe("whsec_old");
    expect(decryptSecret(fresh, during)).toBe("whsec_new");
    expect(decryptSecret(fresh, after)).toBe("whsec_new");
    expect(isEncryptedWithPrimary(old, during)).toBe(false);
    expect(isEncryptedWithPrimary(fresh, during)).toBe(true);
    expect(() => decryptSecret(old, after)).toThrow(
      `encrypted with key ${secretsKeyId(oldKey)}, which is not in WEBHOOK_SECRETS_KEY`,
    );
  });

  test("still decrypts the keyless v1 format with any listed key", () => {
    const iv = Buffer.alloc(12, 3);
    const cipher = createCipheriv("aes-256-gcm", oldKey, iv);
    const ciphertext = Buffer.concat([cipher.update("whsec_legacy", "utf8"), cipher.final()]);
    const legacy = ["v1", iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === "string" ? part : part.toString("base64")))
      .join(":");

    expect(decryptSecret(legacy, secretsKeyRing([newKey, oldKey]))).toBe("whsec_legacy");
    expect(isEncryptedWithPrimary(legacy, secretsKeyRing([oldKey]))).toBe(false);
    expect(() => decryptSecret(legacy, secretsKeyRing([newKey]))).toThrow("No key");
  });

  test("parses a comma-separated key list, newest first", () => {
    const value = [newKey, oldKey].map((key) => key.toString("base64")).join(", ");
    const ring = parseSecretsKeys(value);
    expect(ring.primary.key).toEqual(newKey);
    expect(ring.keys.map((key) => key.id)).toEqual([secretsKeyId(newKey), secretsKeyId(oldKey)]);
    expect(secretsKeyId(newKey)).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(parseSecretsKeys(oldKey.toString("base64")).keys).toHaveLength(1);
  });

  test.each([
    ["", "empty"],
    ["short", "entry 1 must be 32 bytes"],
    [`${Buffer.alloc(32, 1).toString("base64")},${Buffer.alloc(31).toString("base64")}`, "entry 2"],
    [
      `${Buffer.alloc(32, 1).toString("base64")},${Buffer.alloc(32, 1).toString("base64")}`,
      "twice",
    ],
  ])("rejects the key list %p", (value, message) => {
    expect(() => parseSecretsKeys(value)).toThrow(message);
  });
});

describe("signatureHeaders", () => {
  test("signs with every secret, space-separated", () => {
    const input = { id: "msg_1", timestamp: 1700000000, body: "{}" };
    const [current, previous] = [generateSigningSecret(), generateSigningSecret()];
    const headers = signatureHeaders({ ...input, secrets: [current, previous] });
    expect(headers["webhook-signature"]).toBe(
      `${signPayload({ ...input, secret: current })} ${signPayload({ ...input, secret: previous })}`,
    );
    expect(signatureHeaders({ ...input, secrets: [current] })["webhook-signature"]).toBe(
      signPayload({ ...input, secret: current }),
    );
  });
});

describe("validateWebhookUrl", () => {
  test.each([
    ["not a url", "full URL"],
    ["http://example.com/hook", "https://"],
    ["ftp://example.com/hook", "https://"],
    ["https://user:pass@example.com/hook", "username"],
    ["https://localhost/hook", "public"],
    ["https://127.0.0.1/hook", "public"],
    ["https://[::1]/hook", "public"],
    ["https://169.254.169.254/latest/meta-data", "public"],
  ])("rejects %s", (url, message) => {
    expect(() => validateWebhookUrl(url, { allowInsecure: false })).toThrow(message);
  });

  test("accepts public https URLs, and local http ones in development", () => {
    expect(validateWebhookUrl("https://example.com/hook?x=1", { allowInsecure: false }).href).toBe(
      "https://example.com/hook?x=1",
    );
    expect(validateWebhookUrl("http://localhost:4000/hook", { allowInsecure: true }).href).toBe(
      "http://localhost:4000/hook",
    );
  });
});

describe("createWebhookSender", () => {
  const request = (url: string) => ({ url, headers: { "x-test": "1" }, body: '{"ok":true}' });

  test("posts the body with the given headers", async () => {
    const receiver = webhookReceiver();
    try {
      const send = createWebhookSender({ allowPrivateNetworks: true });
      const response = await send(request(receiver.url));
      expect(response).toEqual({ status: 200, body: "ok" });
      expect(receiver.received[0]?.body).toBe('{"ok":true}');
      expect(receiver.received[0]?.headers.get("x-test")).toBe("1");
      expect(receiver.received[0]?.headers.get("content-type")).toBe("application/json");
    } finally {
      receiver.stop();
    }
  });

  test.each([
    ["127.0.0.1", 4],
    ["::ffff:10.0.0.1", 6],
    ["169.254.169.254", 4],
  ])("refuses hosts resolving to %s, even if DNS later changes", async (address, family) => {
    const receiver = webhookReceiver();
    try {
      const send = createWebhookSender({ resolve: async () => [{ address, family }] });
      const port = new URL(receiver.url).port;
      await expect(send(request(`http://hooks.example.com:${port}/x`))).rejects.toThrow(
        WebhookUrlError,
      );
      expect(receiver.received).toHaveLength(0);
    } finally {
      receiver.stop();
    }
  });

  test("refuses private IP literals", async () => {
    const send = createWebhookSender();
    await expect(send(request("http://10.0.0.1/x"))).rejects.toThrow(WebhookUrlError);
  });

  test("does not follow redirects and truncates long responses", async () => {
    const receiver = webhookReceiver((req) =>
      new URL(req.url).searchParams.has("redirect")
        ? Response.redirect("http://127.0.0.1:1/elsewhere", 302)
        : new Response("x".repeat(10_000), { status: 500 }),
    );
    try {
      const send = createWebhookSender({ allowPrivateNetworks: true });
      expect((await send(request(`${receiver.url}?redirect`))).status).toBe(302);
      const long = await send(request(receiver.url));
      expect(long.status).toBe(500);
      expect(long.body).toHaveLength(RESPONSE_EXCERPT_BYTES);
      expect(receiver.received).toHaveLength(2);
    } finally {
      receiver.stop();
    }
  });

  test("gives up on slow endpoints", async () => {
    const receiver = webhookReceiver(async () => {
      await Bun.sleep(1000);
      return new Response("late");
    });
    try {
      const send = createWebhookSender({ allowPrivateNetworks: true });
      await expect(send({ ...request(receiver.url), timeoutMs: 100 })).rejects.toThrow("Timed out");
    } finally {
      receiver.stop();
    }
  });
});
