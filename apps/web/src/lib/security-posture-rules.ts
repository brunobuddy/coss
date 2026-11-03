/** The pure part of the admin console's security page: readings to plain-language verdicts. */

import { formatDateTime } from "./format";

export type CheckState = "ok" | "warning" | "failing" | "unknown";

export type Reading<T> = { ok: true; value: T } | { ok: false; error: string };

export type PostureCheck = {
  id: string;
  label: string;
  state: CheckState;
  /** What was found, right now. */
  summary: string;
  /** What to do, when it isn't ok. */
  fix?: string;
};

export type Readings = {
  baa: Reading<{ active: boolean }>;
  rootMfa: Reading<boolean>;
  lastRootSignIn: Reading<Date | null>;
  trail: Reading<{ logging: boolean; latestDelivery: Date | null; error: string | null } | null>;
  threatDetection: Reading<{ production: boolean; management: boolean }>;
  securityHub: Reading<{ enabled: boolean; standardStatuses: string[] }>;
  configRecording: Reading<boolean>;
  outsideAccess: Reading<boolean>;
  alerts: Reading<{ confirmed: number; pending: number }>;
  accessLogs: Reading<{ loadBalancer: boolean; network: boolean }>;
  databaseAudit: Reading<{ extension: boolean; classes: string | null }>;
  encryption: Reading<{
    targetGroups: { total: number; encrypted: number };
    topics: { total: number; encrypted: number };
  }>;
};

const HOUR_MS = 60 * 60 * 1000;
/** CloudTrail delivers about every 5 minutes; a quiet hour means something broke. */
const TRAIL_STALE_MS = 2 * HOUR_MS;
const ROOT_RECENT_MS = 24 * HOUR_MS;

const COULD_NOT_CHECK = "Couldn't check this, so don't assume it's fine.";

function check<T>(
  id: string,
  label: string,
  reading: Reading<T>,
  evaluate: (value: T) => Pick<PostureCheck, "state" | "summary" | "fix">,
): PostureCheck {
  if (!reading.ok) {
    return { id, label, state: "unknown", summary: COULD_NOT_CHECK, fix: reading.error };
  }
  return { id, label, ...evaluate(reading.value) };
}

export function postureChecks(readings: Readings, now: Date = new Date()): PostureCheck[] {
  return [
    check("baa", "AWS business associate agreement", readings.baa, ({ active }) =>
      active
        ? { state: "ok", summary: "Active, covering every account in the organization." }
        : {
            state: "failing",
            summary: "No active agreement. PHI must not be stored on AWS without one.",
            fix: "In the management account: AWS Artifact, Agreements, Organization agreements.",
          },
    ),
    check("root_mfa", "Root user protected by MFA", readings.rootMfa, (enabled) =>
      enabled
        ? { state: "ok", summary: "The management account's root user requires a second factor." }
        : {
            state: "failing",
            summary: "The account that controls everything can be entered with only a password.",
            fix: "Sign in as root, then Security credentials, Assign MFA device.",
          },
    ),
    check("root_use", "Root user not in use", readings.lastRootSignIn, (last) => {
      if (!last) return { state: "ok", summary: "No root sign-in in the last 90 days." };
      const age = now.getTime() - last.getTime();
      return age < ROOT_RECENT_MS
        ? {
            state: "warning",
            summary: `Root signed in on ${formatDateTime(last)}.`,
            fix: "If that wasn't you, change the root password and check the audit trail now.",
          }
        : { state: "ok", summary: `Last root sign-in: ${formatDateTime(last)}.` };
    }),
    check("audit_trail", "Audit trail recording", readings.trail, (trail) => {
      if (!trail) {
        return {
          state: "failing",
          summary: "There is no record of who did what in AWS.",
          fix: "Apply infra/organization.",
        };
      }
      if (!trail.logging) {
        return {
          state: "failing",
          summary: "The audit trail has been stopped.",
          fix: "Someone turned it off. Find out who, then turn it back on in the management account.",
        };
      }
      if (trail.error) {
        return {
          state: "failing",
          summary: `Logs aren't reaching storage: ${trail.error}.`,
          fix: "Check the audit bucket's policy and key in the management account.",
        };
      }
      if (!trail.latestDelivery) {
        return { state: "warning", summary: "Recording, but nothing has been delivered yet." };
      }
      if (now.getTime() - trail.latestDelivery.getTime() > TRAIL_STALE_MS) {
        return {
          state: "failing",
          summary: `Nothing delivered since ${formatDateTime(trail.latestDelivery)}.`,
          fix: "Check the trail's status in the management account.",
        };
      }
      return { state: "ok", summary: "Every account's activity is stored for six years, locked." };
    }),
    check("threat_detection", "Threat detection", readings.threatDetection, (on) =>
      on.production && on.management
        ? { state: "ok", summary: "GuardDuty watches production and the management account." }
        : {
            state: "failing",
            summary: `GuardDuty is off in ${[
              !on.production && "production",
              !on.management && "the management account",
            ]
              .filter(Boolean)
              .join(" and ")}.`,
            fix: "Re-apply Terraform. Only the management account can remove the policy keeping it on.",
          },
    ),
    check("security_hub", "Configuration checks", readings.securityHub, (hub) => {
      if (!hub.enabled) {
        return {
          state: "failing",
          summary: "Security Hub is off in production.",
          fix: "Apply infra/terraform.",
        };
      }
      if (hub.standardStatuses.length === 0 || !hub.standardStatuses.every((s) => s === "READY")) {
        return {
          state: "warning",
          summary: `Security Hub is on, but its checks aren't running (${hub.standardStatuses.join(", ") || "no standard enabled"}).`,
          fix: "If this lasts more than a few hours, turn the standard off and on again in Security Hub.",
        };
      }
      return {
        state: "ok",
        summary: "Security Hub grades production against AWS's best practices.",
      };
    }),
    check("config", "Configuration history", readings.configRecording, (on) =>
      on
        ? { state: "ok", summary: "AWS Config records how production's resources change." }
        : {
            state: "failing",
            summary: "Config isn't recording, so Security Hub's checks go stale.",
            fix: "Apply infra/terraform.",
          },
    ),
    check("outside_access", "Outside access scanning", readings.outsideAccess, (on) =>
      on
        ? { state: "ok", summary: "Access Analyzer flags anything reachable from outside." }
        : {
            state: "failing",
            summary: "Access Analyzer isn't running.",
            fix: "Apply infra/organization.",
          },
    ),
    check("alerts", "Alerts reach someone", readings.alerts, ({ confirmed, pending }) =>
      confirmed > 0
        ? {
            state: "ok",
            summary: `${confirmed} confirmed email ${confirmed === 1 ? "address gets" : "addresses get"} security alerts.`,
          }
        : {
            state: "failing",
            summary:
              pending > 0
                ? "The alert email was never confirmed, so nobody gets alerts."
                : "Nobody subscribes to the alerts.",
            fix: "Subscribe an email to the coss-alerts SNS topic and click its confirmation link.",
          },
    ),
    check("access_logs", "Access logs arriving", readings.accessLogs, (logs) =>
      logs.loadBalancer && logs.network
        ? { state: "ok", summary: "Load balancer and network logs arrived today or yesterday." }
        : {
            state: "warning",
            summary: `No recent ${[
              !logs.loadBalancer && "load balancer",
              !logs.network && "network",
            ]
              .filter(Boolean)
              .join(" or ")} logs.`,
            fix: "Check the delivery settings. New logs take a few minutes to appear after setup.",
          },
    ),
    check("database_audit", "Database audit log", readings.databaseAudit, (audit) =>
      audit.extension && audit.classes && audit.classes !== "none"
        ? {
            state: "ok",
            summary: "Postgres records every schema and role change, without customer data.",
          }
        : {
            state: "warning",
            summary: "Postgres isn't recording schema or role changes.",
            fix: "Reboot the database after applying its parameter group, then CREATE EXTENSION pgaudit.",
          },
    ),
    check("encryption", "Encryption inside AWS", readings.encryption, ({ targetGroups, topics }) =>
      targetGroups.encrypted === targetGroups.total && topics.encrypted === topics.total
        ? {
            state: "ok",
            summary: "Traffic reaching the containers and notifications are encrypted.",
          }
        : {
            state: "warning",
            summary: `Not yet encrypted: ${plainFailures([
              targetGroups.encrypted < targetGroups.total &&
                `${targetGroups.total - targetGroups.encrypted} of ${targetGroups.total} load balancer routes to containers`,
              topics.encrypted < topics.total &&
                `${topics.total - topics.encrypted} of ${topics.total} notification topics`,
            ])}.`,
            fix: "PHI must be encrypted in transit and at rest under the BAA. Apply infra/terraform.",
          },
    ),
  ];
}

function plainFailures(found: Array<string | false>): string {
  return found.filter(Boolean).join(" and ");
}

const STATE_ORDER: Record<CheckState, number> = { failing: 0, unknown: 1, warning: 2, ok: 3 };

export function sortChecks(checks: readonly PostureCheck[]): PostureCheck[] {
  return [...checks].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

export type Threat = {
  id: string;
  account: "production" | "management";
  title: string;
  description: string;
  severity: number;
  lastSeen: Date | null;
  count: number;
};

export function threatLevel(severity: number): "critical" | "high" | "medium" | "low" {
  if (severity >= 9) return "critical";
  if (severity >= 7) return "high";
  if (severity >= 4) return "medium";
  return "low";
}

export type ControlFinding = {
  controlId: string;
  title: string;
  severity: string;
  compliance: "PASSED" | "FAILED";
  remediationUrl: string | null;
};

export type FailingControl = {
  controlId: string;
  title: string;
  severity: string;
  resources: number;
  remediationUrl: string | null;
};

/** Security Hub evaluates its controls over about a day; a handful passing means little. */
const MIN_CONTROLS_FOR_SCORE = 20;

export type ControlScore = {
  /** Controls with no failing resource, as a whole percent; null until enough have been evaluated. */
  percent: number | null;
  passing: number;
  total: number;
  failing: FailingControl[];
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"];

export function scoreControls(findings: readonly ControlFinding[]): ControlScore {
  const controls = new Map<string, { failing: FailingControl | null }>();
  for (const finding of findings) {
    const control = controls.get(finding.controlId) ?? { failing: null };
    controls.set(finding.controlId, control);
    if (finding.compliance !== "FAILED") continue;
    if (control.failing) {
      control.failing.resources += 1;
    } else {
      control.failing = {
        controlId: finding.controlId,
        title: finding.title,
        severity: finding.severity,
        resources: 1,
        remediationUrl: finding.remediationUrl,
      };
    }
  }
  const failing = [...controls.values()]
    .flatMap((control) => (control.failing ? [control.failing] : []))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
        a.controlId.localeCompare(b.controlId),
    );
  const total = controls.size;
  const passing = total - failing.length;
  return {
    percent: total < MIN_CONTROLS_FOR_SCORE ? null : Math.round((passing / total) * 100),
    passing,
    total,
    failing,
  };
}

export type Verdict = { tone: "success" | "warning" | "error"; title: string; description: string };

export function postureVerdict(
  checks: readonly PostureCheck[],
  threats: Reading<readonly Threat[]>,
): Verdict {
  const urgentThreats = threats.ok ? threats.value.filter((t) => t.severity >= 7).length : 0;
  const failing = checks.filter((c) => c.state === "failing").length;
  const unknown = checks.filter((c) => c.state === "unknown").length + (threats.ok ? 0 : 1);
  const warnings = checks.filter((c) => c.state === "warning").length;

  if (urgentThreats > 0) {
    return {
      tone: "error",
      title: `${urgentThreats} serious ${urgentThreats === 1 ? "threat" : "threats"} to look at now`,
      description: "AWS's threat detection flagged activity that could mean an attack.",
    };
  }
  if (failing > 0) {
    return {
      tone: "error",
      title: `${failing} ${failing === 1 ? "protection is" : "protections are"} broken`,
      description: "Something that should always be on isn't. Each one below says what to do.",
    };
  }
  if (unknown > 0) {
    return {
      tone: "warning",
      title: `${unknown} ${unknown === 1 ? "check" : "checks"} couldn't run`,
      description: "This page can't vouch for what it couldn't read.",
    };
  }
  if (warnings > 0) {
    return {
      tone: "warning",
      title: `${warnings} ${warnings === 1 ? "thing" : "things"} to look at`,
      description: "Nothing is broken, but check these are expected.",
    };
  }
  return {
    tone: "success",
    title: "All clear",
    description: "Every protection is on and nothing serious has been flagged.",
  };
}

export type DatabaseAuditEntry = {
  at: Date;
  kind: string;
  command: string;
  object: string;
  statement: string;
};

const STATEMENT_LENGTH = 200;

export type LogQueryRow = Record<string, string>;

export function logQueryRows(
  results: { field?: string | undefined; value?: string | undefined }[][],
): LogQueryRow[] {
  return results.map((row) =>
    Object.fromEntries(row.map(({ field, value }) => [field ?? "", value ?? ""])),
  );
}

/** Logs Insights writes `2026-11-03 14:06:29.000`, in UTC. A row it can't date fails the read. */
export function logQueryTime(value: string): Date {
  const at = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(at.getTime())) throw new Error(`Unreadable log time: ${value}`);
  return at;
}

/** One pgaudit log line: `… AUDIT: SESSION,1,1,DDL,CREATE TABLE,TABLE,public.x,create table x,<not logged>`. */
export function parseAuditLine(message: string, at: Date): DatabaseAuditEntry | null {
  const start = message.indexOf("AUDIT: ");
  if (start === -1) return null;
  const fields = message.slice(start + "AUDIT: ".length).split(",");
  if (fields.length < 8) return null;
  const [, , , kind, command, , object] = fields;
  const statement = fields
    .slice(7)
    .join(",")
    .replace(/,<[^>]*>\s*$/, "")
    .trim();
  return {
    at,
    kind: kind ?? "",
    command: command ?? "",
    object: object ?? "",
    statement:
      statement.length > STATEMENT_LENGTH ? `${statement.slice(0, STATEMENT_LENGTH)}…` : statement,
  };
}
