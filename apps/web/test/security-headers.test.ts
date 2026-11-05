import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { clientIpFromForwardedFor } from "../src/lib/client-ip";
import {
  contentSecurityPolicy,
  LOGO_CSP,
  LOGO_PATH,
  RECEIVED_CONTENT_CSP,
  RECEIVED_CONTENT_PATHS,
  securityHeaders,
  TURNSTILE_ORIGIN,
} from "../src/lib/security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

test("production CSP: own scripts (and Turnstile's) only, never framed", () => {
  const policy = directives(contentSecurityPolicy({ dev: false }));
  expect(TURNSTILE_ORIGIN).toBe("https://challenges.cloudflare.com");
  expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'", TURNSTILE_ORIGIN]);
  expect(policy.get("frame-src")).toEqual(["'self'", TURNSTILE_ORIGIN]);
  expect(policy.get("connect-src")).toEqual(["'self'"]);
  expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
  expect(policy.get("object-src")).toEqual(["'none'"]);
  expect(policy.has("upgrade-insecure-requests")).toBe(true);
  // No directive allows another third-party origin for scripts, frames or connections.
  for (const name of ["script-src", "frame-src", "connect-src", "default-src"]) {
    for (const value of policy.get(name) ?? []) {
      if (value !== TURNSTILE_ORIGIN) expect(value).not.toMatch(/^https?:|^\*$/);
    }
  }
  expect(policy.get("connect-src")).not.toContain(TURNSTILE_ORIGIN);
});

test("dev CSP allows what next dev needs, and only then", () => {
  const policy = directives(contentSecurityPolicy({ dev: true }));
  expect(policy.get("script-src")).toContain("'unsafe-eval'");
  expect(policy.has("upgrade-insecure-requests")).toBe(false);
});

test("framing is denied by header too", () => {
  expect(securityHeaders({ dev: false })).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
});

test("client IP: the entry the trusted proxies appended, never a client-supplied one", () => {
  // CloudFront appends the viewer, the ALB appends CloudFront.
  expect(clientIpFromForwardedFor("203.0.113.7, 130.176.1.2", 2)).toBe("203.0.113.7");
  expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.7, 130.176.1.2", 2)).toBe("203.0.113.7");
  expect(clientIpFromForwardedFor("2001:db8::1, 130.176.1.2", 2)).toBe("2001:db8::1");
  expect(clientIpFromForwardedFor("130.176.1.2", 2)).toBeNull();
  expect(clientIpFromForwardedFor("evil, 130.176.1.2", 2)).toBeNull();
  expect(clientIpFromForwardedFor(null, 2)).toBeNull();
  expect(clientIpFromForwardedFor("203.0.113.7", 0)).toBeNull();
});

test("received emails' download routes are the paths their sandboxing CSP covers", () => {
  const routes = RECEIVED_CONTENT_PATHS.map((source) =>
    join(
      import.meta.dir,
      "../src/app",
      source.replace(/:(\w+)/g, (_, name: string) => `[${name}]`),
      "route.ts",
    ),
  );
  for (const route of routes) expect(existsSync(route)).toBe(true);
  expect(RECEIVED_CONTENT_CSP).toStartWith("sandbox;");
});

test("the organization logo route is the path its sandboxing CSP covers", () => {
  const route = join(
    import.meta.dir,
    "../src/app",
    LOGO_PATH.replace(/:(\w+)/g, (_, name: string) => `[${name}]`),
    "route.ts",
  );
  expect(existsSync(route)).toBe(true);
  expect(LOGO_CSP).toStartWith("sandbox;");
  expect(LOGO_CSP).not.toContain("script-src");
});
