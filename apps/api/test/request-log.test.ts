import { describe, expect, test } from "bun:test";
import { memoryLogWriter } from "@coss/logs/testing";
import { Hono } from "hono";
import { markEmailContent, requestLog } from "../src/middleware/request-log.ts";
import type { AppEnv } from "../src/types.ts";
import { waitForLogLines } from "./helpers.ts";

function loggedApp(response: () => Response) {
  const writer = memoryLogWriter();
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("attemptedAuth", {
      organizationId: "org_test",
      projectId: "proj_test",
      environmentId: "env_test",
      apiKeyId: "key_test",
      ownerUserId: null,
      mode: "sandbox",
      hipaaMode: false,
    });
    c.set("requestId", "req_test");
    c.set("clientIp", null);
    await next();
  });
  app.use("*", requestLog(writer));
  app.get("/v1/example", () => response());
  return { app, writer };
}

const LIMIT = 64 * 1024;

describe("response log byte limit", () => {
  for (const size of [LIMIT - 1, LIMIT, LIMIT + 1]) {
    test(`JSON response of ${size} bytes without Content-Length`, async () => {
      const body = JSON.stringify({ value: "a".repeat(size - 12) });
      expect(new TextEncoder().encode(body).byteLength).toBe(size);
      const { app, writer } = loggedApp(() => Response.json(JSON.parse(body)));
      const response = await app.request("/v1/example");
      expect(response.headers.has("content-length")).toBe(false);
      const [line] = await waitForLogLines(writer, 1);
      const logged = line?.attributes?.response as { body?: unknown };
      expect(Object.hasOwn(logged, "body")).toBe(size <= LIMIT);
      expect(await response.text()).toBe(body);
    });
  }

  test("counts UTF-8 bytes even with an understated Content-Length", async () => {
    const body = JSON.stringify({ value: "é".repeat(LIMIT / 2) });
    const { app, writer } = loggedApp(
      () =>
        new Response(body, {
          headers: { "content-type": "application/json", "content-length": "1" },
        }),
    );
    const response = await app.request("/v1/example");
    const [line] = await waitForLogLines(writer, 1);
    expect(line?.attributes?.response).not.toHaveProperty("body");
    expect(await response.text()).toBe(body);
  });

  test("stops logging an oversized stream before it finishes without cancelling the client", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
        value.enqueue(new TextEncoder().encode('{"value":"'));
        value.enqueue(new Uint8Array(LIMIT).fill(97));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { app, writer } = loggedApp(
      () => new Response(stream, { headers: { "content-type": "application/json" } }),
    );
    const response = await app.request("/v1/example");
    const [line] = await waitForLogLines(writer, 1);
    expect(line?.attributes?.response).not.toHaveProperty("body");
    expect(cancelled).toBe(false);
    controller.enqueue(new TextEncoder().encode('"}'));
    controller.close();
    expect(await response.json()).toEqual({ value: "a".repeat(LIMIT) });
  });
});

for (const status of [201, 422]) {
  test(`booker sessions never log the attendee's details (status ${status})`, async () => {
    const { app, writer } = loggedApp(() => Response.json({}));
    const path = "/v1/scheduling/booker_sessions";
    app.post(path, async (c) => {
      await c.req.json();
      return Response.json({ object: "scheduling.session", id: "schs_1" }, { status });
    });
    await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attendee: { name: "Sam Lee", email: "sam@example.com" } }),
    });
    const [line] = await waitForLogLines(writer, 1);
    expect(line?.attributes?.request).not.toHaveProperty("body");
    expect(JSON.stringify(line)).not.toContain("sam@example.com");
  });
}

// Why someone's away can be medical, notes are encrypted everywhere else, and a feed's address or a
// session's link is a credential.
for (const [path, secret] of [
  ["/v1/scheduling/out_of_office", "Recovering from surgery"],
  ["/v1/scheduling/out_of_office/ooo_1", "Recovering from surgery"],
  ["/v1/scheduling/out_of_office/by_external_id/leave_1", "Recovering from surgery"],
  ["/v1/scheduling/reassignments", "Recovering from surgery"],
  ["/v1/scheduling/reassignments/preview", "Recovering from surgery"],
  ["/v1/scheduling/holiday_calendars", "https://example.com/feed.ics?token=secret"],
] as const) {
  test(`${path} keeps no body either way`, async () => {
    const { app, writer } = loggedApp(() => Response.json({}));
    app.post(path, async (c) => {
      const body = await c.req.json();
      return Response.json({ object: "scheduling.thing", id: "x_1", ...body }, { status: 201 });
    });
    await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: secret, note: secret, ics_url: secret }),
    });
    const [line] = await waitForLogLines(writer, 1);
    expect(JSON.stringify(line)).not.toContain(secret);
  });
}

test("a manager session's link stays out of its response's log line", async () => {
  const { app, writer } = loggedApp(() => Response.json({}));
  const path = "/v1/scheduling/manager_sessions";
  app.post(path, () =>
    Response.json(
      {
        id: "schs_1",
        token: "cossch_secret",
        url: "https://book.example.com/t/schs_1#cossch_secret",
      },
      { status: 201 },
    ),
  );
  await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hosts: ["host_1"] }),
  });
  const [line] = await waitForLogLines(writer, 1);
  expect(JSON.stringify(line)).not.toContain("cossch_secret");
});

for (const path of ["/v1/risk/email/check", "/v1/risk/ip/check", "/v1/risk/content/classify"]) {
  for (const status of [200, 422, 500]) {
    test(`${path} omits both bodies at status ${status}`, async () => {
      const { app, writer } = loggedApp(() => Response.json({}));
      const body = {
        email: "private@example.com",
        canonical: "private@example.com",
        ip: "203.0.113.9",
        scores: { spam: 0.99 },
      };
      app.post(path, async (c) => {
        await c.req.json();
        return Response.json(body, { status });
      });
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(await response.json()).toEqual(body);
      const [line] = await waitForLogLines(writer, 1);
      expect(line?.attributes?.request).not.toHaveProperty("body");
      expect(line?.attributes?.response).not.toHaveProperty("body");
      expect(line?.statusCode).toBe(status);
    });
  }
}

for (const status of [200, 422]) {
  test(`/v1/verifications/check never logs the code (status ${status})`, async () => {
    const { app, writer } = loggedApp(() => Response.json({}));
    app.post("/v1/verifications/check", async (c) => {
      await c.req.json();
      return Response.json({ object: "verification_check", valid: false }, { status });
    });
    await app.request("/v1/verifications/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "+14155550123", code: "482913" }),
    });
    const [line] = await waitForLogLines(writer, 1);
    expect(line?.attributes?.request).not.toHaveProperty("body");
    expect(JSON.stringify(line)).not.toContain("482913");
  });
}

describe("email content", () => {
  test("an email's own discard snapshot redacts the request, even when its response is too big to read", async () => {
    const writer = memoryLogWriter();
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("attemptedAuth", {
        organizationId: "org_test",
        projectId: "proj_test",
        environmentId: "env_test",
        apiKeyId: "key_test",
        ownerUserId: null,
        mode: "sandbox",
        hipaaMode: false,
      });
      c.set("requestId", "req_test");
      c.set("clientIp", null);
      await next();
    });
    app.use("*", requestLog(writer));
    const html = `<p>${"x".repeat(LIMIT)}</p>`;
    app.post("/v1/emails", async (c) => {
      const body = await c.req.json();
      const email = { object: "email", ...body, content_storage: { mode: "discard" } };
      markEmailContent(c, [email]);
      return c.json(email, 202);
    });

    const response = await app.request("/v1/emails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Results", text: "5.1", html }),
    });
    expect(response.status).toBe(202);
    const [line] = await waitForLogLines(writer, 1);
    const logged = line?.attributes as { request: { body: unknown }; response: object };
    expect(logged.response).not.toHaveProperty("body");
    expect(logged.request.body).toEqual({
      subject: "[7 characters]",
      text: "[3 characters]",
      html: `[${html.length} characters]`,
    });
  });
});
