import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ShieldCheckIcon, ShieldIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  getSecurityPosture,
  type SecurityPosture,
  securityPostureConfigured,
} from "@/lib/security-posture";
import { type CheckState, threatLevel, type Verdict } from "@/lib/security-posture-rules";
import { requirePlatformAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Security" };

const REFRESH_SECONDS = 300;

const CHECK_STATE: Record<CheckState, { label: string; tone: StatusTone }> = {
  ok: { label: "On", tone: "success" },
  warning: { label: "Look at this", tone: "warning" },
  failing: { label: "Broken", tone: "error" },
  unknown: { label: "Couldn't check", tone: "warning" },
};

const VERDICT_TONE: Record<Verdict["tone"], StatusTone> = {
  success: "success",
  warning: "warning",
  error: "error",
};

const THREAT_TONE: Record<ReturnType<typeof threatLevel>, StatusTone> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "neutral",
};

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
};

function Unreadable(props: { title: string }) {
  return (
    <PanelBody flush>
      <EmptyState
        compact
        description="AWS didn't answer, so this page can't say either way. It tries again in a few minutes."
        icon={TriangleAlertIcon}
        title={props.title}
      />
    </PanelBody>
  );
}

function Threats({ threats }: Pick<SecurityPosture, "threats">) {
  if (!threats.ok) return <Unreadable title="Couldn't read threat detection" />;
  if (threats.value.length === 0) {
    return (
      <PanelBody flush>
        <EmptyState
          compact
          description="GuardDuty has flagged nothing of medium severity or above."
          icon={ShieldCheckIcon}
          title="No threats"
        />
      </PanelBody>
    );
  }
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>Severity</TableHead>
          <TableHead>What happened</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {threats.value.map((threat) => {
          const level = threatLevel(threat.severity);
          return (
            <TableRow key={threat.id}>
              <TableCell>
                <StatusDot tone={THREAT_TONE[level]}>
                  <span className="capitalize">{level}</span>
                </StatusDot>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{threat.title}</div>
                <div className="text-muted-foreground text-xs">{threat.description}</div>
              </TableCell>
              <TableCell className="capitalize">{threat.account}</TableCell>
              <TableCell title={formatDateTime(threat.lastSeen)}>
                {threat.lastSeen ? formatRelative(threat.lastSeen) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Score({ score }: Pick<SecurityPosture, "score">) {
  if (!score.ok) return <Unreadable title="Couldn't read Security Hub" />;
  if (score.value.percent === null) {
    return (
      <PanelBody flush>
        <EmptyState
          compact
          description="Security Hub's first full evaluation can take up to a day after it's turned on."
          icon={ShieldIcon}
          title="No results yet"
        />
      </PanelBody>
    );
  }
  const urgent = score.value.failing.filter((control) =>
    ["CRITICAL", "HIGH"].includes(control.severity),
  );
  const others = score.value.failing.length - urgent.length;
  return (
    <>
      <PanelBody>
        <p className="font-heading font-semibold text-3xl tabular-nums">{score.value.percent}%</p>
        <p className="text-muted-foreground text-sm">
          {score.value.passing} of {score.value.total} checks pass.
          {others > 0
            ? ` ${others} lower-priority ${others === 1 ? "one fails" : "ones fail"}, not listed here.`
            : ""}
        </p>
      </PanelBody>
      {urgent.length > 0 ? (
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Check</TableHead>
              <TableHead className="text-right">Resources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {urgent.map((control) => (
              <TableRow key={control.controlId}>
                <TableCell>
                  <StatusDot tone={SEVERITY_TONE[control.severity] ?? "neutral"}>
                    <span className="capitalize">{control.severity.toLowerCase()}</span>
                  </StatusDot>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {control.remediationUrl ? (
                    <a
                      className="underline underline-offset-4"
                      href={control.remediationUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {control.title}
                    </a>
                  ) : (
                    control.title
                  )}
                  <div className="font-mono text-muted-foreground text-xs">{control.controlId}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{control.resources}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
}

function OutsideAccess({ outsideAccess }: Pick<SecurityPosture, "outsideAccess">) {
  if (!outsideAccess.ok) return <Unreadable title="Couldn't read Access Analyzer" />;
  if (outsideAccess.value.length === 0) {
    return (
      <PanelBody flush>
        <EmptyState
          compact
          description="Nothing is reachable from outside the organization, other than what serves the public through the load balancers."
          icon={ShieldCheckIcon}
          title="Nothing exposed"
        />
      </PanelBody>
    );
  }
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead>Reachable by</TableHead>
          <TableHead>Resource</TableHead>
          <TableHead>Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {outsideAccess.value.map((finding) => (
          <TableRow key={finding.id}>
            <TableCell>
              {finding.isPublic ? (
                <Badge variant="destructive">Anyone</Badge>
              ) : (
                <Badge variant="outline">Another account</Badge>
              )}
            </TableCell>
            <TableCell className="whitespace-normal break-all font-mono text-xs">
              {finding.resource}
            </TableCell>
            <TableCell>{finding.resourceType}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * AWS's security services in one place, in plain language. Read-only: fixes happen in Terraform or
 * the AWS console. `@/lib/security-posture` shows a failed read as unknown, never as fine.
 */
export default async function AdminSecurityPage() {
  await requirePlatformAdmin();
  const description = "Whether AWS is protected, and whether anything needs you.";

  if (!securityPostureConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader description={description} title="Security" />
        <Panel>
          <PanelBody flush>
            <EmptyState
              compact
              description="Set SECURITY_MANAGEMENT_ROLE_ARN, SECURITY_ALERTS_TOPIC_ARN and SECURITY_ACCESS_LOGS_BUCKET (infra/AGENTS.md, “Security monitoring”)."
              icon={ShieldIcon}
              title="Security monitoring isn't set up"
            />
          </PanelBody>
        </Panel>
      </div>
    );
  }

  const posture = await getSecurityPosture();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <AutoRefresh renderedAt={posture.checkedAt.toISOString()} seconds={REFRESH_SECONDS} />
        }
        description={description}
        title="Security"
      />

      <Panel>
        <PanelBody>
          <StatusDot
            className="font-heading font-semibold text-xl"
            tone={VERDICT_TONE[posture.verdict.tone]}
          >
            {posture.verdict.title}
          </StatusDot>
          <p className="mt-1 text-muted-foreground text-sm">{posture.verdict.description}</p>
        </PanelBody>
      </Panel>

      <Panel
        description="High and critical ones also email the coss-alerts address, as do root sign-ins and changes to the audit trail."
        title="Threats"
      >
        <Threats threats={posture.threats} />
      </Panel>

      <Panel
        description="What should always be on, checked each time this page loads."
        title="Protections"
      >
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Protection</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>What's going on</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posture.checks.map((check) => (
              <TableRow key={check.id}>
                <TableCell className="font-medium">{check.label}</TableCell>
                <TableCell>
                  <StatusDot tone={CHECK_STATE[check.state].tone}>
                    {CHECK_STATE[check.state].label}
                  </StatusDot>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {check.summary}
                  {check.fix ? (
                    <div className="text-muted-foreground text-xs">{check.fix}</div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        description="Security Hub grades production against AWS's best practices. Not every failure matters for you, so treat it as a to-do list rather than an alarm."
        title="Best-practice score"
      >
        <Score score={posture.score} />
      </Panel>

      <Panel
        description="Resources Access Analyzer found open to anyone outside the organization."
        title="Outside access"
      >
        <OutsideAccess outsideAccess={posture.outsideAccess} />
      </Panel>
    </div>
  );
}
