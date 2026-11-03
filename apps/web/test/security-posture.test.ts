import { describe, expect, test } from "bun:test";
import {
  logQueryRows,
  logQueryTime,
  parseAuditLine,
  postureChecks,
  postureVerdict,
  type Readings,
  ROUTINE_AUDIT_LINE,
  scoreControls,
  sortChecks,
  threatLevel,
} from "../src/lib/security-posture-rules";

const NOW = new Date("2026-11-03T12:00:00Z");

function healthy(): Readings {
  return {
    baa: { ok: true, value: { active: true } },
    rootMfa: { ok: true, value: true },
    lastRootSignIn: { ok: true, value: new Date("2026-10-01T00:00:00Z") },
    trail: {
      ok: true,
      value: { logging: true, latestDelivery: new Date("2026-11-03T11:55:00Z"), error: null },
    },
    threatDetection: { ok: true, value: { production: true, management: true } },
    securityHub: { ok: true, value: { enabled: true, standardStatuses: ["READY"] } },
    configRecording: { ok: true, value: true },
    outsideAccess: { ok: true, value: true },
    alerts: { ok: true, value: { confirmed: 1, pending: 0 } },
    accessLogs: { ok: true, value: { loadBalancer: true, network: true } },
    databaseAudit: { ok: true, value: { extension: true, classes: "ddl,role" } },
    encryption: {
      ok: true,
      value: { targetGroups: { total: 6, encrypted: 6 }, topics: { total: 3, encrypted: 3 } },
    },
  };
}

function stateOf(readings: Readings, id: string) {
  return postureChecks(readings, NOW).find((check) => check.id === id)?.state;
}

describe("posture checks", () => {
  test("everything healthy is all clear", () => {
    const checks = postureChecks(healthy(), NOW);
    expect(checks.every((check) => check.state === "ok")).toBe(true);
    expect(postureVerdict(checks, { ok: true, value: [] }).title).toBe("All clear");
  });

  test("a failed read is unknown and never all clear", () => {
    const readings = { ...healthy(), rootMfa: { ok: false as const, error: "AccessDenied" } };
    expect(stateOf(readings, "root_mfa")).toBe("unknown");
    const verdict = postureVerdict(postureChecks(readings, NOW), { ok: true, value: [] });
    expect(verdict.tone).toBe("warning");
    expect(verdict.title).toBe("1 check couldn't run");
  });

  test("unreadable threats are never all clear", () => {
    const verdict = postureVerdict(postureChecks(healthy(), NOW), { ok: false, error: "Timeout" });
    expect(verdict.tone).toBe("warning");
  });

  test("the audit trail fails when missing, stopped, erroring or stale", () => {
    const trail = (value: Extract<Readings["trail"], { ok: true }>["value"]) => ({
      ...healthy(),
      trail: { ok: true as const, value },
    });
    const fresh = new Date("2026-11-03T11:55:00Z");
    expect(stateOf(trail(null), "audit_trail")).toBe("failing");
    expect(
      stateOf(trail({ logging: false, latestDelivery: fresh, error: null }), "audit_trail"),
    ).toBe("failing");
    expect(
      stateOf(
        trail({ logging: true, latestDelivery: fresh, error: "AccessDenied" }),
        "audit_trail",
      ),
    ).toBe("failing");
    expect(
      stateOf(
        trail({ logging: true, latestDelivery: new Date("2026-11-03T08:00:00Z"), error: null }),
        "audit_trail",
      ),
    ).toBe("failing");
  });

  test("a recent root sign-in asks for a look", () => {
    const readings = {
      ...healthy(),
      lastRootSignIn: { ok: true as const, value: new Date("2026-11-03T09:00:00Z") },
    };
    expect(stateOf(readings, "root_use")).toBe("warning");
    expect(stateOf({ ...healthy(), lastRootSignIn: { ok: true, value: null } }, "root_use")).toBe(
      "ok",
    );
  });

  test("an unconfirmed subscriber doesn't count", () => {
    const readings = {
      ...healthy(),
      alerts: { ok: true as const, value: { confirmed: 0, pending: 1 } },
    };
    expect(stateOf(readings, "alerts")).toBe("failing");
  });

  test("threat detection needs both accounts", () => {
    const readings = {
      ...healthy(),
      threatDetection: { ok: true as const, value: { production: true, management: false } },
    };
    const check = postureChecks(readings, NOW).find((c) => c.id === "threat_detection");
    expect(check?.state).toBe("failing");
    expect(check?.summary).toContain("the management account");
  });

  test("problems sort first", () => {
    const readings = {
      ...healthy(),
      securityHub: { ok: true as const, value: { enabled: false, standardStatuses: [] } },
    };
    expect(sortChecks(postureChecks(readings, NOW))[0]?.id).toBe("security_hub");
  });
});

describe("the verdict", () => {
  test("a serious threat outranks everything", () => {
    const verdict = postureVerdict(postureChecks(healthy(), NOW), {
      ok: true,
      value: [
        {
          id: "f",
          account: "production",
          title: "x",
          description: "",
          severity: 8,
          lastSeen: null,
          count: 1,
        },
      ],
    });
    expect(verdict.tone).toBe("error");
    expect(verdict.title).toBe("1 serious threat to look at now");
  });

  test("threat levels follow GuardDuty's bands", () => {
    expect(threatLevel(9)).toBe("critical");
    expect(threatLevel(7)).toBe("high");
    expect(threatLevel(4)).toBe("medium");
    expect(threatLevel(1)).toBe("low");
  });
});

describe("scoreControls", () => {
  test("a control fails if any resource fails, worst first", () => {
    const finding = (controlId: string, severity: string, compliance: "PASSED" | "FAILED") => ({
      controlId,
      title: controlId,
      severity,
      compliance,
      remediationUrl: null,
    });
    const score = scoreControls([
      ...Array.from({ length: 16 }, (_, i) => finding(`X.${i}`, "LOW", "PASSED")),
      finding("S3.1", "MEDIUM", "PASSED"),
      finding("S3.1", "MEDIUM", "FAILED"),
      finding("S3.1", "MEDIUM", "FAILED"),
      finding("IAM.1", "CRITICAL", "FAILED"),
      finding("RDS.1", "HIGH", "PASSED"),
      finding("ECS.1", "LOW", "PASSED"),
    ]);
    expect(score.total).toBe(20);
    expect(score.passing).toBe(18);
    expect(score.percent).toBe(90);
    expect(score.failing.map((c) => c.controlId)).toEqual(["IAM.1", "S3.1"]);
    expect(score.failing[1]?.resources).toBe(2);
  });

  test("no score until enough controls have run", () => {
    expect(scoreControls([]).percent).toBeNull();
    const finding = {
      controlId: "S3.1",
      title: "S3.1",
      severity: "HIGH",
      compliance: "FAILED" as const,
      remediationUrl: null,
    };
    const early = scoreControls([finding]);
    expect(early.percent).toBeNull();
    expect(early.failing).toHaveLength(1);
  });
});

describe("parseAuditLine", () => {
  const at = new Date("2026-11-03T00:00:00Z");

  test("reads a line, keeping commas in the statement", () => {
    expect(
      parseAuditLine(
        '2026-11-03 00:00:00 UTC:10.0.0.1(1):coss@coss:[1]:LOG:  AUDIT: SESSION,1,1,DDL,CREATE TABLE,TABLE,public.t,"create table t (a int, b int)",<not logged>',
        at,
      ),
    ).toEqual({
      at,
      kind: "DDL",
      command: "CREATE TABLE",
      object: "public.t",
      statement: "create table t (a int, b int)",
    });
  });

  test("ignores other lines and cuts long statements", () => {
    expect(parseAuditLine("LOG:  connection received", at)).toBeNull();
    const line = `AUDIT: SESSION,1,1,ROLE,ALTER ROLE,,,${"x".repeat(300)},<not logged>`;
    expect(parseAuditLine(line, at)?.statement).toHaveLength(201);
  });
});

describe("routine audit lines", () => {
  const line = (rest: string) => `x:LOG:  AUDIT: SESSION,16,1,${rest},<not logged>`;

  test("leaves out what every deploy re-runs", () => {
    for (const routine of [
      'DDL,CREATE TABLE,,,"create table if not exists ""hook_message_p20261107"" partition of ""hook_message"" for values from (\'a\') to (\'b\')"',
      'DDL,CREATE SCHEMA,,,"CREATE SCHEMA IF NOT EXISTS ""drizzle"""',
      'DDL,CREATE TABLE,,,"CREATE TABLE IF NOT EXISTS ""drizzle"".""__drizzle_migrations"" ( id SERIAL )"',
    ]) {
      expect(ROUTINE_AUDIT_LINE.test(line(routine))).toBe(true);
    }
  });

  test("keeps real changes, even ones that mention routine statements", () => {
    for (const change of [
      "DDL,CREATE EXTENSION,,,CREATE EXTENSION IF NOT EXISTS pgaudit",
      'DDL,CREATE TABLE,,,"create table if not exists ""customers"" (id int)"',
      'DDL,DROP SCHEMA,,,"DROP SCHEMA ""drizzle"""',
      'ROLE,GRANT,,,"create table if not exists ""x_p20261107"" (a int); grant all to attacker"',
      "ROLE,ALTER ROLE,,,alter role coss superuser",
    ]) {
      expect(ROUTINE_AUDIT_LINE.test(line(change))).toBe(false);
    }
  });
});

describe("log query results", () => {
  test("reads the rows and times Logs Insights returns", () => {
    expect(
      logQueryRows([
        [
          { field: "@timestamp", value: "2026-11-03 14:06:29.000" },
          { field: "@message", value: "AUDIT: x" },
        ],
      ]),
    ).toEqual([{ "@timestamp": "2026-11-03 14:06:29.000", "@message": "AUDIT: x" }]);
    expect(logQueryTime("2026-11-03 14:06:29.000")).toEqual(new Date("2026-11-03T14:06:29Z"));
  });

  test("a time it can't read fails, rather than dropping the change", () => {
    expect(() => logQueryTime("")).toThrow();
  });
});

describe("encryption and audit checks", () => {
  test("an unencrypted route or topic asks for a look, naming what's left", () => {
    const readings = {
      ...healthy(),
      encryption: {
        ok: true as const,
        value: { targetGroups: { total: 6, encrypted: 0 }, topics: { total: 3, encrypted: 3 } },
      },
    };
    const found = postureChecks(readings, NOW).find((c) => c.id === "encryption");
    expect(found?.state).toBe("warning");
    expect(found?.summary).toContain("6 of 6 load balancer routes");
    expect(found?.summary).not.toContain("topics");
  });

  test("the audit log needs the extension and something to log", () => {
    const audit = (extension: boolean, classes: string | null) => ({
      ...healthy(),
      databaseAudit: { ok: true as const, value: { extension, classes } },
    });
    expect(stateOf(audit(false, "ddl,role"), "database_audit")).toBe("warning");
    expect(stateOf(audit(true, "none"), "database_audit")).toBe("warning");
    expect(stateOf(audit(true, "ddl,role"), "database_audit")).toBe("ok");
  });
});

describe("Security Hub's check", () => {
  const hub = (enabled: boolean, standardStatuses: string[]) => ({
    ...healthy(),
    securityHub: { ok: true as const, value: { enabled, standardStatuses } },
  });

  test("on but not grading isn't fine", () => {
    expect(stateOf(hub(true, ["PENDING"]), "security_hub")).toBe("warning");
    expect(stateOf(hub(true, []), "security_hub")).toBe("warning");
    expect(stateOf(hub(true, ["READY"]), "security_hub")).toBe("ok");
    expect(stateOf(hub(false, []), "security_hub")).toBe("failing");
  });
});
