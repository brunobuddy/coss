import { expect, test } from "bun:test";
import spec from "@coss/api/openapi.json";
import { apiOrigins, contentSecurityPolicy } from "../src/lib/security-headers";
import { DEV_API_ORIGIN } from "../src/lib/site";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

test("no third-party script origin, never framed", () => {
  const policy = directives(contentSecurityPolicy({ dev: false }));
  for (const value of policy.get("script-src") ?? []) expect(value).toMatch(/^'[a-z-]+'$/);
  expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
  expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
  expect(policy.get("object-src")).toEqual(["'none'"]);
});

test("the playground may call exactly the API servers of the OpenAPI document", () => {
  const servers = spec.servers.map((server) => new URL(server.url).origin);
  expect(servers.length).toBeGreaterThan(0);
  expect(apiOrigins({ dev: false })).toEqual(servers);
  expect(directives(contentSecurityPolicy({ dev: false })).get("connect-src")).toEqual([
    "'self'",
    ...servers,
  ]);
  expect(apiOrigins({ dev: true })).toContain(DEV_API_ORIGIN);
});

test("frames nothing", () => {
  const policy = directives(contentSecurityPolicy({ dev: false }));
  expect(policy.get("frame-src")).toBeUndefined();
  expect(policy.get("default-src")).toEqual(["'self'"]);
});
