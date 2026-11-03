import { describe, expect, spyOn, test } from "bun:test";
import { idTimestamp } from "@coss/db/id";
import { insertLogDrainRecords } from "../src/drain-outbox.ts";
import { toLogRow } from "../src/entries.ts";
import { csvField, logCsvRow } from "../src/export.ts";
import { formatLogQuery, parseLogQuery, statusRange } from "../src/query.ts";
import { histogramBucketMs } from "../src/read.ts";
import {
  EMAIL_CONTENT_KEYS,
  loggedRequestHeaders,
  MAX_LOGGED_BODY,
  MAX_LOGGED_STRING,
  REDACTED,
  redactBody,
} from "../src/redact.ts";
import { ListLogsQuery } from "../src/schemas.ts";

describe("parseLogQuery", () => {
  test("keys, aliases, repeats, negation and free text", () => {
    const filters = parseLogQuery(
      'level:error level:warn status:5xx method:post route:/v1/emails -type:email.opened to:User@Example.com "bad gateway" timeout',
    );
    expect(filters).toEqual({
      levels: ["error", "warning"],
      statuses: ["5xx"],
      methods: ["POST"],
      routes: ["/v1/emails"],
      recipient: "user@example.com",
      exclude: { types: ["email.opened"] },
      text: "bad gateway timeout",
    });
  });

  test("invalid values and unknown keys stay free text", () => {
    expect(parseLogQuery("level:loud foo:bar status:600")).toEqual({
      text: "level:loud foo:bar status:600",
    });
  });

  test("single-valued keys and quoted values", () => {
    expect(parseLogQuery('request:req_1 resource:"email_2" path:/v1/domains')).toEqual({
      requestId: "req_1",
      resourceId: "email_2",
      paths: ["/v1/domains"],
    });
  });

  test("formatLogQuery round-trips", () => {
    const input =
      'level:error status:4xx method:GET route:/v1/emails/:id key:key_1 request:req_1 -source:webhook "some text"';
    const parsed = parseLogQuery(input);
    expect(parseLogQuery(formatLogQuery(parsed))).toEqual(parsed);
  });

  test("statusRange", () => {
    expect(statusRange("4xx")).toEqual([400, 500]);
    expect(statusRange("404")).toEqual([404, 405]);
  });
});

describe("redactBody", () => {
  test("drops secrets, attachment bytes and long strings", () => {
    const body = redactBody({
      from: "a@example.com",
      html: "x".repeat(MAX_LOGGED_STRING + 10),
      attachments: [{ filename: "a.pdf", content: "QUJD".repeat(100) }],
      secret: "whsec_abc",
      nested: { api_key: "coss_live_x", password: "p", token: null },
    }) as Record<string, unknown>;
    expect(body.from).toBe("a@example.com");
    expect(body.html).toEndWith("… [10 more characters]");
    expect(body.attachments).toEqual([{ filename: "a.pdf", content: "[400 characters]" }]);
    expect(body.secret).toBe(REDACTED);
    expect(body.nested).toEqual({ api_key: REDACTED, password: REDACTED, token: null });
    const checkout = redactBody({
      checkout: { amount: 100, card: { fingerprint: "fp_abc", country: "US" } },
      device: { token: "cd1.abc" },
    }) as { checkout: { card: Record<string, unknown> }; device: Record<string, unknown> };
    expect(checkout.checkout.card).toEqual({ fingerprint: REDACTED, country: "US" });
    expect(checkout.device).toEqual({ token: REDACTED });
    const drain = redactBody({
      format: "datadog",
      auth_header: { name: "DD-API-KEY", value: "dd-key" },
    }) as Record<string, unknown>;
    expect(drain).toEqual({ format: "datadog", auth_header: REDACTED });
    // The response's header name is not a credential.
    expect(redactBody({ auth_header_name: "DD-API-KEY" })).toEqual({
      auth_header_name: "DD-API-KEY",
    });
  });

  test("keeps only the sizes of content objects", () => {
    const body = redactBody({
      event: "signup",
      content: { text: "My bio, in my own words", tags: ["a", "bc"] },
    }) as Record<string, unknown>;
    expect(body.event).toBe("signup");
    expect(body.content).toEqual({
      text: "[23 characters]",
      tags: ["[1 characters]", "[2 characters]"],
    });
  });

  test("caps the whole body", () => {
    const big = { items: Array.from({ length: 40 }, () => "y".repeat(1000)) };
    const out = redactBody(big) as { truncated: boolean; bytes: number; preview: string };
    expect(out.truncated).toBe(true);
    expect(out.bytes).toBeGreaterThan(MAX_LOGGED_BODY);
    expect(out.preview.length).toBe(1024);
  });

  test("extra content keys keep only the shape of an email's content, at any depth", () => {
    const email = {
      from: "a@acme.com",
      subject: "Results",
      html: "<p>5.1</p>",
      text: null,
      headers: { "X-Ref": "p-1" },
      tags: [{ name: "kind", value: "results" }],
      attachments: [{ filename: "r.pdf", content: "JVBERi0=" }],
      variables: { glucose: 5.1, diagnosed: true, notes: null, items: [{ dose: 2 }] },
    };
    const redacted = {
      from: "a@acme.com",
      subject: "[7 characters]",
      html: "[10 characters]",
      text: null,
      headers: { "X-Ref": "[3 characters]" },
      tags: [{ name: "kind", value: "results" }],
      attachments: [{ filename: "[5 characters]", content: "[8 characters]" }],
      variables: {
        glucose: "[number]",
        diagnosed: "[boolean]",
        notes: null,
        items: [{ dose: "[number]" }],
      },
    };
    expect(redactBody(email, { content: EMAIL_CONTENT_KEYS })).toEqual(redacted);
    expect(redactBody({ emails: [email] }, { content: EMAIL_CONTENT_KEYS })).toEqual({
      emails: [redacted],
    });
    // Without them, nothing changes.
    expect(redactBody(email)).toMatchObject({ subject: "Results", html: "<p>5.1</p>" });
  });

  test("headers are allow-listed", () => {
    const headers = new Headers({
      authorization: "Bearer coss_live_x",
      cookie: "a=b",
      "content-type": "application/json",
      "idempotency-key": "k1",
    });
    expect(loggedRequestHeaders(headers)).toEqual({
      "content-type": "application/json",
      "idempotency-key": "k1",
    });
  });
});

describe("rows", () => {
  test("ids encode occurred_at and search text is lower-cased", () => {
    const occurredAt = new Date("2026-03-04T05:06:07.890Z");
    const row = toLogRow({
      organizationId: "org_1",
      projectId: "proj_1",
      environmentId: "env_1",
      occurredAt,
      source: "api",
      level: "info",
      type: "api.request",
      message: "POST /v1/Emails 202",
      requestId: "req_ABC",
    });
    expect(idTimestamp(row.id as string)).toBe(occurredAt.getTime());
    expect(row.searchText).toBe("post /v1/emails 202 api.request req_abc");
  });

  test("CSV guards formulas", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField(null)).toBe("");
    expect(logCsvRow({ message: "a" } as never)).toContain("a");
  });

  test("histogram buckets are round", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(histogramBucketMs({ from, to: new Date(from.getTime() + 30 * 60_000) })).toBe(30_000);
    expect(histogramBucketMs({ from, to: new Date(from.getTime() + 7 * 86_400_000) })).toBe(
      3 * 3_600_000,
    );
  });
});

describe("ListLogsQuery", () => {
  test("parses comma lists", () => {
    const parsed = ListLogsQuery.parse({
      level: "warning,error",
      status: "4xx, 503",
      method: "post",
    });
    expect(parsed.level).toEqual(["warning", "error"]);
    expect(parsed.status).toEqual(["4xx", "503"]);
    expect(parsed.method).toEqual(["POST"]);
    expect(ListLogsQuery.safeParse({ level: "loud" }).success).toBe(false);
    expect(ListLogsQuery.safeParse({ status: "600" }).success).toBe(false);
  });
});

describe("log drain record ids", () => {
  test("ascend across writes made in the same millisecond", async () => {
    const inserted: { id?: string }[] = [];
    // Captures the rows instead of writing them (insert → values → onConflictDoNothing).
    const executor = {
      insert: () => ({
        values: (rows: { id?: string }[]) => ({
          onConflictDoNothing: async () => {
            inserted.push(...rows);
          },
        }),
      }),
    } as unknown as Parameters<typeof insertLogDrainRecords>[0];
    const drain = { id: "drain_1", organizationId: "org_1", environmentId: "env_1", sources: [] };
    const line = (sourceId: string) => ({
      organizationId: "org_1",
      environmentId: "env_1",
      source: "api" as const,
      sourceId,
      line: { id: sourceId },
    });
    const clock = spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 12, 12));
    try {
      for (let write = 0; write < 20; write++) {
        await insertLogDrainRecords(
          executor,
          [drain],
          [line(`log_${write}a`), line(`log_${write}b`)],
        );
      }
    } finally {
      clock.mockRestore();
    }
    const ids = inserted.map((row) => row.id ?? "");
    expect(ids).toHaveLength(40);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(40);
  });
});

describe("search terms", () => {
  test("quoted strings, keyed ones, and quotes that never close", () => {
    expect(parseLogQuery('level:error "two words"').levels).toEqual(["error"]);
    expect(parseLogQuery('"two words" plain').text).toBe("two words plain");
    expect(parseLogQuery('"a \\"b\\" c"').text).toBe('a "b" c');
    expect(parseLogQuery('"never closed word').text).toBe('"never closed word');
  });

  test("many unclosed quotes stay fast", () => {
    const started = performance.now();
    parseLogQuery('"a '.repeat(50_000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
