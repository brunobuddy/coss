import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { auditClientIp } from "../src/lib/client-ip";

// Next parses `config.matcher` statically from src/proxy.ts, so it must stay a literal there; read
// it from the source rather than importing the module (which validates the environment).
const source = readFileSync(path.join(import.meta.dir, "../src/proxy.ts"), "utf8");
const literal = source.match(/matcher: \["(.+)"\]/)?.[1];
if (!literal) throw new Error("matcher not found in src/proxy.ts");
const matcher = new RegExp(`^${JSON.parse(`"${literal}"`)}$`);

describe("proxy matcher", () => {
  test("runs for paths with dots, so their X-Forwarded-For is replaced too", () => {
    for (const pathname of [
      "/acme/default/production/email/domains/a.b",
      "/api/auth/scim/v2/Users/x.y",
      "/acme/default/production/developers/logs/export.csv",
      "/dashboard",
      "/api/auth/sign-in/email",
    ]) {
      expect(matcher.test(pathname)).toBe(true);
    }
  });

  test("skips Next's assets and the root files `next dev` proxies to the site", () => {
    for (const pathname of [
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
      "/icon.svg",
    ]) {
      expect(matcher.test(pathname)).toBe(false);
    }
  });
});

describe("auditClientIp", () => {
  test("takes the single address the proxy left", () => {
    expect(auditClientIp("203.0.113.7", 2)).toBe("203.0.113.7");
    expect(auditClientIp("2001:db8::1", 2)).toBe("2001:db8::1");
  });

  test("ignores anything else, and everything without trusted proxies", () => {
    expect(auditClientIp("203.0.113.7", 0)).toBeNull();
    expect(auditClientIp(null, 2)).toBeNull();
    expect(auditClientIp("unknown", 2)).toBeNull();
    // A raw chain the proxy never rewrote, e.g. a client-chosen first entry.
    expect(auditClientIp("1.2.3.4, 203.0.113.7, 198.51.100.1", 2)).toBeNull();
    expect(auditClientIp(`${"9".repeat(60)}.1.1.1`, 2)).toBeNull();
  });
});
