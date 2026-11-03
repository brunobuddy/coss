import { expect, test } from "bun:test";
import { Hono } from "hono";
import { accessLogWith } from "../src/middleware/access-log.ts";

async function linesFor(path: string) {
  const lines: string[] = [];
  const app = new Hono().use(accessLogWith((line) => lines.push(line)));
  app.all("*", (c) => c.text("ok"));
  await app.request(path);
  return lines.join("\n");
}

test("query strings stay out of the access log", async () => {
  const log = await linesFor(
    "/scheduling/oauth/google/callback?state=secret-state&code=secret-code&scope=x",
  );
  expect(log).toContain("GET /scheduling/oauth/google/callback");
  expect(log).toContain("200");
  expect(log).not.toContain("secret-state");
  expect(log).not.toContain("secret-code");
});

test("capability tokens in paths are masked", async () => {
  const log = await linesFor("/f/c/secret-confirmation-token");
  expect(log).toContain("/f/c/[token]");
  expect(log).not.toContain("secret-confirmation-token");
});
