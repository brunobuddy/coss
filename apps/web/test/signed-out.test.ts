import { describe, expect, test } from "bun:test";
import { answersNotFoundWhenSignedOut, notFoundDocument } from "../src/lib/signed-out";

const request = (pathname: string, method = "GET") => ({ method, pathname });

describe("answersNotFoundWhenSignedOut", () => {
  test("answers 404 for paths that could be an organization's or nothing at all", () => {
    for (const pathname of [
      "/blog",
      "/does-not-exist",
      "/acme",
      "/acme/default/production/email",
    ]) {
      expect(answersNotFoundWhenSignedOut(request(pathname))).toBe(true);
    }
    expect(answersNotFoundWhenSignedOut(request("/blog", "HEAD"))).toBe(true);
  });

  test("keeps the redirect for the dashboard's own pages and API", () => {
    for (const pathname of [
      "/dashboard",
      "/settings/security",
      "/admin",
      "/onboarding",
      "/app/authorize",
      "/api/support/tickets",
    ]) {
      expect(answersNotFoundWhenSignedOut(request(pathname))).toBe(false);
    }
  });

  test("doesn't mistake a slug that starts like a dashboard page for one", () => {
    expect(answersNotFoundWhenSignedOut(request("/dashboards"))).toBe(true);
    expect(answersNotFoundWhenSignedOut(request("/apple"))).toBe(true);
  });

  test("keeps the redirect for server actions", () => {
    expect(answersNotFoundWhenSignedOut(request("/acme", "POST"))).toBe(false);
  });
});

describe("notFoundDocument", () => {
  test("refreshes to sign-in, keeping where the visitor was going, and asks not to be indexed", () => {
    const html = notFoundDocument("/sign-in?next=%2Facme%3Fto%3D%252Femail&x=1");
    expect(html).toContain('content="0;url=/sign-in?next=%2Facme%3Fto%3D%252Femail&amp;x=1"');
    expect(html).toContain('<a href="/sign-in?next=%2Facme%3Fto%3D%252Femail&amp;x=1">');
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  test("can't be broken out of by the requested path", () => {
    const signIn = new URL("/sign-in", "https://coss.com");
    signIn.searchParams.set("next", `/"><script>alert(1)</script>`);
    const html = notFoundDocument(`${signIn.pathname}${signIn.search}`);
    expect(html).not.toContain("<script");
    expect(html).toContain("next=%2F%22%3E%3Cscript%3E");
  });
});
