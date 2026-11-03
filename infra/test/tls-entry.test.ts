import { afterEach, describe, expect, test } from "bun:test";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { selfSignedCertificate } from "../runtime/tls-entry.mjs";

const ENTRY = resolve(import.meta.dir, "../runtime/tls-entry.mjs");
const running: Bun.Subprocess[] = [];

afterEach(() => {
  for (const process of running.splice(0)) process.kill("SIGKILL");
});

/** A plain HTTP app like Next's server: binds to HOSTNAME, echoes a header, exits on SIGTERM. */
function fixtureApp(): string {
  const path = join(mkdtempSync(join(tmpdir(), "tls-entry-")), "app.mjs");
  writeFileSync(
    path,
    `import { createServer } from "node:http";
     const server = createServer((req, res) => res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"] ?? null })));
     server.listen(Number(process.env.PORT), process.env.HOSTNAME);
     process.on("SIGTERM", () => server.close(() => process.exit(0)));`,
  );
  return path;
}

function get(port: number): Promise<{ status: number; body: string; protocol: string | null }> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/",
        rejectUnauthorized: false,
        headers: { "x-forwarded-for": "203.0.113.9" },
      },
      (res) => {
        const protocol = (res.socket as import("node:tls").TLSSocket).getProtocol?.() ?? null;
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => done({ status: res.statusCode ?? 0, body, protocol }));
      },
    );
    req.on("error", fail);
    req.end();
  });
}

async function eventually<T>(read: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      last = error;
      await Bun.sleep(100);
    }
  }
  throw last;
}

let nextPort = 24_000 + Math.floor(Math.random() * 10_000);

describe("selfSignedCertificate", () => {
  test("is a certificate its key signed, valid now", () => {
    const { cert } = selfSignedCertificate(new Date("2026-11-03T00:00:00Z"));
    const parsed = new X509Certificate(cert);
    expect(parsed.subject).toContain("coss-target");
    expect(parsed.verify(parsed.publicKey)).toBe(true);
    expect(new Date(parsed.validFrom).getTime()).toBeLessThan(Date.parse("2026-11-03T00:00:00Z"));
    expect(new Date(parsed.validTo).getTime()).toBeGreaterThan(Date.parse("2036-01-01T00:00:00Z"));
  });

  test("a new key each time", () => {
    expect(selfSignedCertificate().key).not.toEqual(selfSignedCertificate().key);
  });
});

for (const runtime of ["node", "bun"]) {
  describe(`tls-entry on ${runtime}`, () => {
    test("serves the app over TLS, byte for byte, and exits when the app does", async () => {
      const plain = nextPort++;
      const tls = nextPort++;
      const child = Bun.spawn([runtime, ENTRY, fixtureApp()], {
        // What Fargate does to every task: only the entry's override makes 127.0.0.1 reachable.
        env: { ...process.env, PORT: String(plain), TLS_PORT: String(tls), HOSTNAME: "192.0.2.1" },
        stdout: "ignore",
        stderr: "inherit",
      });
      running.push(child);

      const response = await eventually(() => get(tls));
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ forwarded: "203.0.113.9" });
      expect(response.protocol).toMatch(/^TLSv1\.[23]$/);

      child.kill("SIGTERM");
      expect(await child.exited).toBe(0);
    });

    test("without TLS_PORT it only runs the app", async () => {
      const plain = nextPort++;
      const { TLS_PORT: _unset, ...inherited } = process.env as Record<string, string>;
      const env = { ...inherited, PORT: String(plain), HOSTNAME: "192.0.2.1" };
      const child = Bun.spawn([runtime, ENTRY, fixtureApp()], {
        env,
        stdout: "ignore",
        stderr: "inherit",
      });
      running.push(child);
      const response = await eventually(async () => {
        const res = await fetch(`http://127.0.0.1:${plain}/`);
        return res.status;
      });
      expect(response).toBe(200);
    });
  });
}
