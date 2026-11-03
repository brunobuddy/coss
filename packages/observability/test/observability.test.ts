import { describe, expect, test } from "bun:test";
import type { Event, StreamedSpanJSON } from "@sentry/core";
import { DEFAULT_TRACES_SAMPLE_RATE, sentryConfig } from "../src/config.ts";
import { scrubBreadcrumb, scrubEvent, scrubLog, scrubSpan, scrubUrl } from "../src/scrub.ts";
import { parseDsn, tunnelDestination } from "../src/tunnel.ts";

const DSN = "https://abc123@o42.ingest.us.sentry.io/4507";

describe("sentryConfig", () => {
  test("off without a DSN", () => {
    expect(sentryConfig({})).toBeNull();
    expect(sentryConfig({ SENTRY_DSN: "" })).toBeNull();
  });

  test("off when a value is invalid (the app's schema reports it)", () => {
    expect(sentryConfig({ SENTRY_DSN: "not a url" })).toBeNull();
    expect(sentryConfig({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: "2" })).toBeNull();
  });

  test("defaults and overrides", () => {
    expect(sentryConfig({ SENTRY_DSN: DSN })).toEqual({
      dsn: DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
    });
    expect(
      sentryConfig({
        SENTRY_DSN: DSN,
        SENTRY_ENVIRONMENT: "staging",
        SENTRY_TRACES_SAMPLE_RATE: "0",
      }),
    ).toEqual({ dsn: DSN, environment: "staging", tracesSampleRate: 0 });
  });
});

describe("scrubbing", () => {
  test("masks email addresses and phone numbers in text", () => {
    expect(scrubUrl("bounced for jane.doe+x@mail.example.co.uk today")).toBe(
      "bounced for [email] today",
    );
    expect(scrubUrl("Twilio refused +14155550123: invalid")).toBe(
      "Twilio refused [phone]: invalid",
    );
    expect(scrubUrl("call +1 (415) 555-0123 back")).toBe("call [phone] back");
    const event = scrubEvent({
      message: "no route for a@example.com",
      exception: { values: [{ type: "Error", value: "send to b@example.com failed" }] },
      breadcrumbs: [{ message: "retrying c@example.com" }],
    } as Event);
    expect(event.message).toBe("no route for [email]");
    expect(event.exception?.values?.[0]?.value).toBe("send to [email] failed");
    expect(event.breadcrumbs?.[0]?.message).toBe("retrying [email]");
  });

  test("keeps what only looks like an address or a number", () => {
    for (const text of [
      "react@18.3.1 failed to load",
      "@coss/db@1.2.3",
      "at 2026-11-03T23:17:22+00:00",
      "email_01k8z0abc123 took 1234567 ms",
    ]) {
      expect(scrubUrl(text)).toBe(text);
    }
  });

  test("stays fast on long lines without an address", () => {
    const line = `${"a".repeat(200_000)}@`;
    const started = performance.now();
    scrubUrl(line);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("URLs lose query strings and secret path segments", () => {
    expect(scrubUrl("https://api.coss.com/t/o/tok_secret")).toBe(
      "https://api.coss.com/t/o/[token]",
    );
    expect(scrubUrl("/t/c/tok_secret/3?x=1")).toBe("/t/c/[token]/3");
    expect(scrubUrl("https://track.cosslinks.com/t/u/tok_secret")).toBe(
      "https://track.cosslinks.com/t/u/[token]",
    );
    expect(scrubUrl("https://track.cosslinks.com/t/u/aSecret/unsubscribe")).toBe(
      "https://track.cosslinks.com/t/u/[token]/unsubscribe",
    );
    expect(scrubUrl("/t/u/confirm/aSecret")).toBe("/t/u/confirm/[token]");
    expect(scrubUrl("https://cossforms.com/f/c/cossf_aSecret")).toBe(
      "https://cossforms.com/f/c/[token]",
    );
    expect(scrubUrl("POST /f/c/:token")).toBe("POST /f/c/:token");
    expect(scrubUrl("GET /api/auth/reset-password/abc?callbackURL=x")).toBe(
      "GET /api/auth/reset-password/[token]",
    );
    expect(scrubUrl("/reset-password?token=abc#top")).toBe("/reset-password");
    expect(scrubUrl("/acme/projects/default")).toBe("/acme/projects/default");
    expect(scrubUrl("[api] Unhandled error on GET /t/o/tok?x=1: why? boom")).toBe(
      "[api] Unhandled error on GET /t/o/[token] why? boom",
    );
  });

  test("other providers' API keys are masked wherever text is scrubbed", () => {
    // Built at runtime: key-shaped literals trip secret scanners.
    const resendKey = ["re", "AbC123", "x".repeat(24)].join("_");
    const sendgridKey = ["SG", "a".repeat(22), "B".repeat(43)].join(".");
    expect(scrubUrl(`Resend refused ${resendKey}`)).toBe("Resend refused re_[key]");
    expect(scrubUrl(`key ${sendgridKey} failed`)).toBe("key SG.[key] failed");
    expect(scrubUrl("we retry_count re_try")).toBe("we retry_count re_try");
    const event = scrubEvent({
      request: { headers: { "X-Postmark-Server-Token": "uuid", accept: "json" } },
    } as Event);
    expect(event.request?.headers).toEqual({ accept: "json" });
  });

  test("console messages and log lines", () => {
    const event = scrubEvent({
      message: "[api] failed on GET /t/c/tok/1?u=2",
      exception: {
        values: [{ type: "TypeError", value: "fetch failed for https://x.test/a?k=v" }],
      },
    } as Event);
    expect(event.message).toBe("[api] failed on GET /t/c/[token]/1");
    expect(event.exception?.values?.[0]?.value).toBe("fetch failed for https://x.test/a");
    const log = scrubLog({
      level: "error",
      message: "[api] Unhandled error on GET /t/o/tok:",
      attributes: { "sentry.message.parameter.0": "/reset-password/abc", count: 2 },
    });
    expect(log.message).toBe("[api] Unhandled error on GET /t/o/[token]:");
    expect(log.attributes).toEqual({
      "sentry.message.parameter.0": "/reset-password/[token]",
      count: 2,
    });
  });

  test("events lose credentials, bodies and secret URLs", () => {
    const event = scrubEvent({
      transaction: "GET /t/o/tok_secret",
      request: {
        url: "https://coss.com/sso?code=c&state=s",
        query_string: "code=c&state=s",
        cookies: { session: "s" },
        data: { html: "<p>customer content</p>" },
        headers: {
          Authorization: "Bearer coss_live_x",
          Cookie: "session=s",
          Referer: "https://coss.com/reset-password?token=t",
          "User-Agent": "test",
        },
      },
      contexts: {
        trace: {
          span_id: "1",
          trace_id: "2",
          data: { "url.full": "https://api.coss.com/t/c/tok/1?a=b", "url.query": "a=b" },
        },
      },
      spans: [
        {
          span_id: "3",
          trace_id: "2",
          start_timestamp: 0,
          op: "http.client",
          description: "GET https://api.coss.com/t/o/tok?x",
          data: {},
        },
        {
          span_id: "4",
          trace_id: "2",
          start_timestamp: 0,
          op: "db",
          description: "select * from email where id = $1 and x ? y",
          data: {},
        },
      ],
      breadcrumbs: [{ category: "fetch", data: { url: "/api/auth/reset-password/t?x=1" } }],
    } as unknown as Event);
    expect(event.transaction).toBe("GET /t/o/[token]");
    expect(event.request).toEqual({
      url: "https://coss.com/sso",
      headers: { Referer: "https://coss.com/reset-password", "User-Agent": "test" },
    });
    expect(event.contexts?.trace?.data).toEqual({
      "url.full": "https://api.coss.com/t/c/[token]/1",
    });
    expect(event.spans?.map((span) => span.description)).toEqual([
      "GET https://api.coss.com/t/o/[token]",
      "select * from email where id = $1 and x ? y",
    ]);
    expect(event.breadcrumbs?.[0]?.data).toEqual({ url: "/api/auth/reset-password/[token]" });
  });

  test("streamed spans lose secret URLs, query strings and client addresses", () => {
    const span = scrubSpan({
      trace_id: "1",
      span_id: "2",
      name: "GET /t/c/tok_secret/2",
      start_timestamp: 0,
      status: "ok",
      is_segment: true,
      attributes: {
        "sentry.op": "http.server",
        "sentry.segment.name": "GET /t/c/tok_secret/2",
        "url.full": "https://api.coss.com/t/c/tok_secret/2?utm=x",
        "url.path": "/t/c/tok_secret/2",
        "url.query": "utm=x",
        "url.path.parameter.token": "tok_secret",
        "client.address": "203.0.113.9",
        "http.request.header.authorization": ["Bearer coss_live_x"],
        "http.request.header.user-agent": ["test"],
        "http.route": "/t/c/:token/:position",
      },
    } as unknown as StreamedSpanJSON);
    expect(span.name).toBe("GET /t/c/[token]/2");
    expect(span.attributes).toEqual({
      "sentry.op": "http.server",
      "sentry.segment.name": "GET /t/c/[token]/2",
      "url.full": "https://api.coss.com/t/c/[token]/2",
      "url.path": "/t/c/[token]/2",
      "http.request.header.user-agent": ["test"],
      "http.route": "/t/c/:token/:position",
    });
    const db = scrubSpan({
      name: "select 1 where a = ?",
      attributes: { "sentry.op": { value: "db", type: "string" } },
    } as unknown as StreamedSpanJSON);
    expect(db.name).toBe("select 1 where a = ?");
  });

  test("navigation breadcrumbs", () => {
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/sso?code=1", to: "/acme" } }).data,
    ).toEqual({ from: "/sso", to: "/acme" });
  });
});

describe("tunnel", () => {
  const envelope = (header: unknown) =>
    new TextEncoder().encode(`${JSON.stringify(header)}\n{"type":"event"}\n{}`);

  test("parses DSNs", () => {
    expect(parseDsn(DSN)).toEqual({
      origin: "https://o42.ingest.us.sentry.io",
      pathPrefix: "",
      publicKey: "abc123",
      projectId: "4507",
    });
    expect(parseDsn("https://k@sentry.example.com/self-hosted/7")?.pathPrefix).toBe("/self-hosted");
    expect(parseDsn("https://o42.ingest.sentry.io/4507")).toBeNull();
    expect(parseDsn("nonsense")).toBeNull();
  });

  test("forwards envelopes for the configured DSN only", () => {
    expect(tunnelDestination(envelope({ dsn: DSN, event_id: "e" }), DSN)).toBe(
      "https://o42.ingest.us.sentry.io/api/4507/envelope/",
    );
    expect(
      tunnelDestination(envelope({ dsn: "https://abc123@o42.ingest.us.sentry.io/9999" }), DSN),
    ).toBeNull();
    expect(
      tunnelDestination(envelope({ dsn: "https://other@o42.ingest.us.sentry.io/4507" }), DSN),
    ).toBeNull();
    expect(
      tunnelDestination(envelope({ dsn: "https://abc123@evil.example/4507" }), DSN),
    ).toBeNull();
    expect(tunnelDestination(envelope({}), DSN)).toBeNull();
    expect(tunnelDestination(new TextEncoder().encode("not json\n{}"), DSN)).toBeNull();
  });
});
