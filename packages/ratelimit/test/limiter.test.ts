import { afterAll, describe, expect, test } from "bun:test";
import { db, pool, schema } from "@coss/db";
import { uniqueSuffix } from "@coss/db/testing";
import { createTestTenant } from "@coss/tenancy/testing";
import { asc, eq } from "drizzle-orm";
import { BUCKETS, MAX_RULE_VALUE } from "../src/buckets.ts";
import { clientIpResolver } from "../src/client-ip.ts";
import { describeRule, formatPeriod, parsePeriod } from "../src/format.ts";
import { createRateLimiter, hashEmail } from "../src/limiter.ts";
import {
  cachedOverrides,
  changeRateLimitOverride,
  deleteRateLimitOverride,
  listRateLimitOverrides,
  setRateLimitOverride,
} from "../src/overrides.ts";
import type { RateLimitStore } from "../src/store.ts";
import { memoryLimiter, testValkeyLimiter } from "../src/testing.ts";

const valkeyLimiter = await testValkeyLimiter();
afterAll(() => valkeyLimiter.close());

describe("limiter", () => {
  test("counts per subject and reports the tightest bucket", async () => {
    const limiter = memoryLimiter();
    const a = `key_${uniqueSuffix()}`;
    for (let i = 0; i < BUCKETS["api.write"].burst; i++) {
      expect((await limiter.consume({ buckets: ["api.write"], subject: a })).allowed).toBe(true);
    }
    const denied = await limiter.consume({ buckets: ["api.write"], subject: a });
    expect(denied).toMatchObject({ allowed: false, bucket: "api.write", limit: 30, remaining: 0 });
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    // Another key and another route class are separate buckets.
    expect((await limiter.consume({ buckets: ["api.write"], subject: "b" })).allowed).toBe(true);
    expect((await limiter.consume({ buckets: ["api.read"], subject: a })).allowed).toBe(true);
  });

  test("charges several buckets of one subject against Valkey", async () => {
    const org = `org_${uniqueSuffix()}`;
    const request = {
      buckets: ["email.recipients.second", "email.recipients.day"] as const,
      subject: org,
      cost: 40,
    };
    const first = await valkeyLimiter.consume(request);
    expect(first).toMatchObject({
      allowed: true,
      bucket: "email.recipients.second",
      remaining: 60,
    });
    await valkeyLimiter.refund(request);
    expect((await valkeyLimiter.consume({ ...request, peek: true })).remaining).toBe(60);
  });

  test("a per-call rule replaces the bucket's rule and any override, in memory and Valkey", async () => {
    for (const limiter of [memoryLimiter(), valkeyLimiter]) {
      const endpoint = `hep_${uniqueSuffix()}`;
      const request = {
        buckets: ["hooks.endpoint.attempts"] as const,
        subject: endpoint,
        organizationId: `org_${uniqueSuffix()}`,
        rule: { limit: 2, periodMs: 1000 },
      };
      expect((await limiter.consume(request)).allowed).toBe(true);
      expect((await limiter.consume(request)).allowed).toBe(true);
      const denied = await limiter.consume(request);
      expect(denied).toMatchObject({ allowed: false, limit: 2 });
      // The bucket's own rule (burst 50) still applies without one.
      const plain = await limiter.consume({ buckets: ["hooks.endpoint.attempts"], subject: "x" });
      expect(plain.limit).toBe(BUCKETS["hooks.endpoint.attempts"].burst);
    }
    await expect(
      memoryLimiter().consume({
        buckets: ["hooks.destination.attempts", "hooks.host.attempts"],
        subject: "example.com",
        rule: { limit: 1, periodMs: 1000 },
      }),
    ).rejects.toThrow(/exactly one bucket/);
    await expect(
      memoryLimiter().consume({
        buckets: ["hooks.endpoint.attempts"],
        subject: "x",
        rule: { limit: 0, periodMs: 1000 },
      }),
    ).rejects.toThrow(/positive integer/);
  });

  test("refuses buckets with different scopes in one request", async () => {
    await expect(
      memoryLimiter().consume({ buckets: ["auth.sign_in.ip", "auth.sign_in.email"], subject: "x" }),
    ).rejects.toThrow(/share a scope/);
  });

  test("uses each bucket's explicit store-failure policy", async () => {
    const errors: unknown[] = [];
    const broken: RateLimitStore = {
      consume: async () => {
        throw new Error("down");
      },
      close: async () => {},
    };
    const limiter = createRateLimiter({ store: broken, onStoreError: (e) => errors.push(e) });
    const read = await limiter.consume({ buckets: ["api.read"], subject: "k" });
    expect(read).toMatchObject({ allowed: true, failedOpen: true, limit: 100 });
    const write = await limiter.consume({ buckets: ["api.write"], subject: "k" });
    expect(write).toMatchObject({ allowed: false, failedOpen: false, remaining: 0 });
    await limiter.refund({ buckets: ["api.read"], subject: "k" });
    expect(errors).toHaveLength(3);
  });

  test("keys never contain raw emails or braces", async () => {
    const keys: string[] = [];
    const spy: RateLimitStore = {
      consume: async (specs) => {
        keys.push(...specs.map((s) => s.key));
        return {
          allowed: true,
          limits: specs.map(() => ({ remaining: 1, resetMs: 0, retryAfterMs: 0 })),
        };
      },
      close: async () => {},
    };
    const limiter = createRateLimiter({ store: spy, prefix: "p" });
    await limiter.consume({ buckets: ["auth.sign_in.email"], subject: " Ann@Example.com" });
    await limiter.consume({ buckets: ["auth.sign_in.ip"], subject: "}{evil" });
    expect(keys[0]).toBe(`p:rl:{email:${hashEmail("ann@example.com")}}:auth.sign_in.email`);
    expect(keys[1]).toMatch(/^p:rl:\{ip:[0-9a-f]{32}\}:auth\.sign_in\.ip$/);
  });
});

describe("overrides", () => {
  test("replace the default rule for one organization", async () => {
    const { organization } = await createTestTenant();
    await setRateLimitOverride({
      organizationId: organization.id,
      bucket: "api.read",
      rule: { limit: 2, periodMs: 60_000 },
    });
    const limiter = memoryLimiter({ overrides: cachedOverrides() });
    const request = {
      buckets: ["api.read"] as const,
      subject: "k",
      organizationId: organization.id,
    };
    expect((await limiter.consume(request)).limit).toBe(2);
    await limiter.consume(request);
    expect((await limiter.consume(request)).allowed).toBe(false);
    // Without the organization the default applies.
    expect((await limiter.consume({ buckets: ["api.read"], subject: "other" })).limit).toBe(100);

    await setRateLimitOverride({
      organizationId: organization.id,
      bucket: "api.read",
      rule: { limit: 5, periodMs: 1000, burst: 20 },
    });
    expect(await listRateLimitOverrides(organization.id)).toEqual({
      "api.read": { limit: 5, periodMs: 1000, burst: 20 },
    });
    expect(
      await deleteRateLimitOverride({ organizationId: organization.id, bucket: "api.read" }),
    ).toBe(true);
    expect(await listRateLimitOverrides(organization.id)).toEqual({});
  });

  test("only overridable buckets with positive integers", async () => {
    const { organization } = await createTestTenant();
    const organizationId = organization.id;
    await expect(
      setRateLimitOverride({
        organizationId,
        bucket: "auth.sign_in.ip",
        rule: { limit: 1, periodMs: 1 },
      }),
    ).rejects.toThrow(/not a bucket/);
    await expect(
      setRateLimitOverride({ organizationId, bucket: "api.read", rule: { limit: 0, periodMs: 1 } }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      setRateLimitOverride({
        organizationId,
        bucket: "api.read",
        rule: { limit: 1, periodMs: MAX_RULE_VALUE + 1 },
      }),
    ).rejects.toThrow(/at most/);
  });

  test("admin changes are audited with the previous and new rules", async () => {
    const { organization, owner } = await createTestTenant();
    const organizationId = organization.id;
    const actor = { userId: owner.id, email: owner.email };
    const bucket = "email.recipients.day";

    // Resetting a bucket without an override changes and records nothing.
    expect(await changeRateLimitOverride({ organizationId, bucket, rule: null, actor })).toBe(
      false,
    );
    expect(
      await changeRateLimitOverride({
        organizationId,
        bucket,
        rule: { limit: 50_000, periodMs: 86_400_000 },
        actor,
        reason: " Upgrade ",
      }),
    ).toBe(true);
    await changeRateLimitOverride({
      organizationId,
      bucket,
      rule: { limit: 60_000, periodMs: 86_400_000, burst: 70_000 },
      actor,
      reason: "More",
    });
    expect(await listRateLimitOverrides(organizationId)).toEqual({
      [bucket]: { limit: 60_000, periodMs: 86_400_000, burst: 70_000 },
    });
    expect(await changeRateLimitOverride({ organizationId, bucket, rule: null, actor })).toBe(true);
    expect(await listRateLimitOverrides(organizationId)).toEqual({});

    const events = await db
      .select()
      .from(schema.adminAuditEvent)
      .where(eq(schema.adminAuditEvent.organizationId, organizationId))
      .orderBy(asc(schema.adminAuditEvent.createdAt), asc(schema.adminAuditEvent.sequence));
    expect(
      events.map((event) => [event.action, event.actorEmail, event.reason, event.metadata]),
    ).toEqual([
      [
        "rate_limit.override_set",
        owner.email,
        "Upgrade",
        { bucket, previous: null, rule: { limit: 50_000, periodMs: 86_400_000, burst: 50_000 } },
      ],
      [
        "rate_limit.override_set",
        owner.email,
        "More",
        {
          bucket,
          previous: { limit: 50_000, periodMs: 86_400_000, burst: 50_000 },
          rule: { limit: 60_000, periodMs: 86_400_000, burst: 70_000 },
        },
      ],
      [
        "rate_limit.override_reset",
        owner.email,
        null,
        {
          bucket,
          previous: { limit: 60_000, periodMs: 86_400_000, burst: 70_000 },
          rule: null,
        },
      ],
    ]);

    await expect(
      changeRateLimitOverride({ organizationId, bucket: "auth.sso.ip", rule: null, actor }),
    ).rejects.toThrow(/not a bucket/);
  });

  test("concurrent first overrides audit the rule they actually replace", async () => {
    const { organization, owner } = await createTestTenant();
    const organizationId = organization.id;
    const bucket = "api.read";
    const actor = { userId: owner.id, email: owner.email };
    const rules = [
      { limit: 10, periodMs: 1000, burst: 20 },
      { limit: 30, periodMs: 2000, burst: 40 },
    ];
    const blocker = await pool.connect();
    let changes: Promise<boolean>[] = [];
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM organization WHERE id = $1 FOR UPDATE", [organizationId]);
      const backend = await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const pid = backend.rows[0]?.pid;
      if (!pid) throw new Error("Missing blocker backend PID");
      changes = rules.map((rule) =>
        changeRateLimitOverride({ organizationId, bucket, rule, actor }),
      );
      // Hold both changes in the database before releasing them. Without the fix, both
      // read the missing override before blocking on the insert's foreign key check.
      let waiting = 0;
      const deadline = Date.now() + 3000;
      while (waiting < 2 && Date.now() < deadline) {
        await blocker.query("SELECT pg_stat_clear_snapshot()");
        const { rows } = await blocker.query<{ count: number }>(
          `WITH RECURSIVE blocked(pid) AS (
            SELECT $1::integer
            UNION
            SELECT activity.pid FROM pg_stat_activity activity
            JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
          ) SELECT (count(*) - 1)::integer AS count FROM blocked`,
          [pid],
        );
        waiting = rows[0]?.count ?? 0;
        if (waiting < 2) await Bun.sleep(10);
      }
      expect(waiting).toBe(2);
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
      await Promise.all(changes);
    }

    // createdAt is when each transaction began; sequence is assigned while holding the lock.
    const events = await db
      .select()
      .from(schema.adminAuditEvent)
      .where(eq(schema.adminAuditEvent.organizationId, organizationId))
      .orderBy(asc(schema.adminAuditEvent.sequence));
    expect(events).toHaveLength(2);
    const first = events[0]?.metadata;
    const second = events[1]?.metadata;
    expect(first).toMatchObject({ bucket, previous: null });
    expect(second).toMatchObject({ bucket, previous: first?.rule });
    expect(events.map((event) => event.metadata.rule)).toEqual(expect.arrayContaining(rules));
    const overrides = await listRateLimitOverrides(organizationId);
    expect(second?.rule).toEqual(overrides[bucket]);
  });

  test("are cached and fall back to defaults when loading fails", async () => {
    let now = 0;
    let calls = 0;
    let fail = false;
    const source = cachedOverrides({
      ttlMs: 1000,
      now: () => now,
      load: async () => {
        calls++;
        if (fail) throw new Error("db down");
        return { "api.read": { limit: 1, periodMs: 1000 } };
      },
    });
    await source("org");
    await source("org");
    expect(calls).toBe(1);
    now = 2000;
    fail = true;
    expect(await source("org")).toEqual({});
    fail = false;
    expect(await source("org")).toEqual({ "api.read": { limit: 1, periodMs: 1000 } });
    expect(calls).toBe(3);
  });
});

describe("format", () => {
  test("parses and formats periods", () => {
    expect(parsePeriod("250ms")).toBe(250);
    expect(parsePeriod(" 5m ")).toBe(300_000);
    expect(parsePeriod("1d")).toBe(86_400_000);
    for (const bad of ["", "5", "1w", "-1s", "1.5s"]) expect(() => parsePeriod(bad)).toThrow();
    expect(formatPeriod(86_400_000)).toBe("1d");
    expect(formatPeriod(90_000)).toBe("90s");
    expect(formatPeriod(1500)).toBe("1500ms");
    expect(describeRule(BUCKETS["api.read"])).toBe("50 per 1s, burst 100");
    expect(describeRule({ limit: 3, periodMs: 3_600_000 })).toBe("3 per 1h, burst 3");
  });
});

describe("clientIpResolver", () => {
  const headers = (value: string) => new Headers({ "x-forwarded-for": value, "x-real-ip": value });

  test("takes the entry our proxies appended", () => {
    expect(clientIpResolver({ header: "x-forwarded-for" })(headers("6.6.6.6, 1.2.3.4"))).toBe(
      "1.2.3.4",
    );
    expect(
      clientIpResolver({ header: "X-Forwarded-For", trustedProxyCount: 2 })(
        headers("6.6.6.6, 1.2.3.4, 10.0.0.1"),
      ),
    ).toBe("1.2.3.4");
    expect(clientIpResolver({ header: "x-real-ip" })(headers("2001:db8::1"))).toBe("2001:db8::1");
  });

  test("is off when unconfigured or the value is not an IP", () => {
    expect(clientIpResolver({})(headers("1.2.3.4"))).toBeNull();
    expect(clientIpResolver({ header: "x-real-ip" })(headers("evil"))).toBeNull();
    expect(
      clientIpResolver({ header: "x-forwarded-for", trustedProxyCount: 3 })(headers("1.2.3.4")),
    ).toBeNull();
  });
});
