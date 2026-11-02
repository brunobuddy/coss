import { expect, test } from "bun:test";
import { contentSecurityPolicy, securityHeaders } from "../src/lib/security-headers.ts";

test("nothing frames a page unless its environment allows it", () => {
  expect(
    contentSecurityPolicy({ dev: false, frameAncestors: [], apiOrigin: "https://api.example" }),
  ).toContain("frame-ancestors 'none'");
  expect(
    contentSecurityPolicy({
      dev: false,
      frameAncestors: ["https://app.example.com"],
      apiOrigin: null,
    }),
  ).toContain("frame-ancestors https://app.example.com");
});

test("the only thing a page can talk to is the client API", () => {
  const policy = contentSecurityPolicy({
    dev: false,
    frameAncestors: [],
    apiOrigin: "https://api.example",
  });
  expect(policy).toContain("connect-src 'self' https://api.example;");
  expect(policy).not.toContain("unsafe-eval");
});

test("URLs carrying a session never leak through a referrer, and nothing's cached", () => {
  const headers = securityHeaders({ dev: false, frameAncestors: [], apiOrigin: null });
  expect(headers["Referrer-Policy"]).toBe("no-referrer");
  expect(headers["Cache-Control"]).toBe("no-store");
  expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
});
