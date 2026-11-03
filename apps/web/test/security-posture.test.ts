import { describe, expect, test } from "bun:test";
import {
  postureChecks,
  postureVerdict,
  type Readings,
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
    securityHub: { ok: true, value: true },
    configRecording: { ok: true, value: true },
    outsideAccess: { ok: true, value: true },
    alerts: { ok: true, value: { confirmed: 1, pending: 0 } },
    accessLogs: { ok: true, value: { loadBalancer: true, network: true } },
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
    const readings = { ...healthy(), securityHub: { ok: true as const, value: false } };
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
      finding("S3.1", "MEDIUM", "PASSED"),
      finding("S3.1", "MEDIUM", "FAILED"),
      finding("S3.1", "MEDIUM", "FAILED"),
      finding("IAM.1", "CRITICAL", "FAILED"),
      finding("RDS.1", "HIGH", "PASSED"),
      finding("ECS.1", "LOW", "PASSED"),
    ]);
    expect(score.total).toBe(4);
    expect(score.passing).toBe(2);
    expect(score.percent).toBe(50);
    expect(score.failing.map((c) => c.controlId)).toEqual(["IAM.1", "S3.1"]);
    expect(score.failing[1]?.resources).toBe(2);
  });

  test("no findings means no score", () => {
    expect(scoreControls([]).percent).toBeNull();
  });
});
