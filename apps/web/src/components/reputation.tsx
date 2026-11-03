import type { ReputationEventWithActor, ReputationStandingRow } from "@coss/reputation";
import { metricsSnapshot } from "@coss/reputation";
import { triggerLabel } from "@coss/reputation/schemas";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Meter, MeterIndicator, MeterTrack } from "@coss/ui/components/meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { HistoryIcon } from "lucide-react";
import Link from "next/link";
import { SupportLink } from "@/components/support/support-link";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "./empty-state";
import { Panel, PanelBody } from "./panel";
import { StatusDot } from "./status-dot";

export { triggerLabel };

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;
}

export function StandingBadge({ status }: { status: ReputationStandingRow["status"] | null }) {
  return (
    <Badge variant="outline">
      {status === "suspended" ? (
        <StatusDot tone="error">Suspended</StatusDot>
      ) : status === "warning" ? (
        <StatusDot tone="warning">Warning</StatusDot>
      ) : (
        <StatusDot tone="success">Good</StatusDot>
      )}
    </Badge>
  );
}

/** Org-wide banner (layout) while the organization is warned or suspended, or marketing paused. */
export function ReputationBanner(props: {
  standing: Pick<
    ReputationStandingRow,
    "status" | "reason" | "marketingPausedAt" | "marketingReason"
  >;
  href: string;
  orgSlug: string;
}) {
  const { status, reason } = props.standing;
  if (status === "good") {
    return props.standing.marketingPausedAt ? (
      <MarketingPausedAlert href={props.href} reason={props.standing.marketingReason} />
    ) : null;
  }
  const suspended = status === "suspended";
  return (
    <Alert variant={suspended ? "error" : "warning"}>
      <AlertTitle>
        {suspended ? "Live sending is suspended" : "Your sending reputation needs attention"}
      </AlertTitle>
      <AlertDescription>
        {suspended ? (
          <>
            coss.com suspended live sending for this organization (
            {triggerLabel(reason).toLowerCase()}). Sandbox keys still work.{" "}
            <SupportLink
              orgSlug={props.orgSlug}
              subject="Live sending suspended"
              topic="deliverability"
            />{" "}
            to resume sending.
          </>
        ) : reason === "content_screening" ? (
          "Content screening flagged some of your recent emails as possible spam or phishing. Emails it is confident about are blocked and suspend live sending automatically."
        ) : (
          `${triggerLabel(reason)} is approaching the level at which coss.com suspends live sending automatically.`
        )}{" "}
        <Link className="underline" href={props.href}>
          View reputation
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/** The marketing stream is paused (transactional email keeps going). */
export function MarketingPausedAlert(props: { reason: string | null; href?: string }) {
  return (
    <Alert variant="warning">
      <AlertTitle>Marketing sending is paused</AlertTitle>
      <AlertDescription>
        coss.com paused marketing sending for this organization (
        {triggerLabel(props.reason).toLowerCase()}): broadcasts and other marketing emails are
        refused until support lifts the pause. Transactional email keeps going.{" "}
        {props.href ? (
          <Link className="underline" href={props.href}>
            View reputation
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** The latest measurements against the policy thresholds. */
export function ReputationChecks({ standing }: { standing: ReputationStandingRow | null }) {
  const snapshot = metricsSnapshot(standing?.metrics);
  return (
    <Panel
      description={
        snapshot
          ? `Live environments, ${formatDateTime(snapshot.windowStart)} – ${formatDateTime(snapshot.windowEnd)}. Measured ${formatDateTime(standing?.lastEvaluatedAt)}.`
          : "Not measured yet: rates are computed once live emails bounce or get complaints."
      }
      title="Sending rates"
    >
      {snapshot && snapshot.checks.length > 0 ? (
        <PanelBody flush>
          {snapshot.checks.map((check) => {
            if (check.rate === null && check.suspendThreshold === null) {
              // A verdict count (content screening), not a rate: no meter to fill.
              return (
                <div
                  className="flex flex-col gap-1 border-t px-5 py-4 first:border-t-0"
                  key={check.trigger}
                >
                  <span className="font-medium text-sm">{triggerLabel(check.trigger)}</span>
                  <p className="text-muted-foreground text-xs">{check.message}</p>
                </div>
              );
            }
            const ceiling = check.suspendThreshold ?? 1;
            const percent = Math.min(100, ((check.rate ?? 0) / (ceiling || 1)) * 100);
            return (
              <div
                className="grid gap-3 border-t px-5 py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-8"
                key={check.trigger}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-sm">{triggerLabel(check.trigger)}</span>
                  <p className="text-muted-foreground text-xs">{check.message}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-heading font-semibold text-2xl tabular-nums tracking-[-0.02em]">
                      {formatRate(check.rate)}
                    </span>
                    <span className="font-mono text-muted-foreground text-xs tabular-nums">
                      {check.count} of {check.volume}
                    </span>
                  </div>
                  <Meter
                    aria-label={`${triggerLabel(check.trigger)} relative to the suspension threshold`}
                    max={100}
                    value={percent}
                  >
                    <MeterTrack className="rounded-full">
                      <MeterIndicator
                        className={
                          check.severity === "suspend"
                            ? "bg-destructive"
                            : check.severity === "warning"
                              ? "bg-warning"
                              : "bg-success"
                        }
                      />
                    </MeterTrack>
                  </Meter>
                  <p className="font-mono text-muted-foreground text-xs">
                    warn {formatRate(check.warningThreshold)} ·{" "}
                    {check.suspendThreshold === null
                      ? "never suspends"
                      : `${check.trigger.startsWith("marketing_") ? "pause marketing" : "suspend"} ${formatRate(check.suspendThreshold)}`}
                    {check.minimumVolume
                      ? ` · from ${check.minimumVolume} ${check.trigger === "hook_failure_rate" ? "deliveries" : "recipients"}`
                      : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </PanelBody>
      ) : null}
    </Panel>
  );
}

const EVENT_LABELS: Record<ReputationEventWithActor["type"], string> = {
  warning_raised: "Warning raised",
  warning_cleared: "Warning cleared",
  suspended: "Suspended",
  reinstated: "Reinstated",
  policy_updated: "Policy updated",
  marketing_paused: "Marketing paused",
  marketing_reinstated: "Marketing resumed",
};

/** Standing history. `showInternal` adds who acted and their notes (platform admins only). */
export function ReputationHistory(props: {
  events: ReputationEventWithActor[];
  showInternal?: boolean;
}) {
  const events = props.showInternal
    ? props.events
    : props.events.filter((event) => event.type !== "policy_updated");
  return (
    <Panel title="History">
      {events.length === 0 ? (
        <PanelBody flush>
          <EmptyState
            compact
            description="Warnings, suspensions and reinstatements are listed here."
            icon={HistoryIcon}
            title="No changes yet"
          />
        </PanelBody>
      ) : (
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>By</TableHead>
              {props.showInternal ? <TableHead>Note</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </TableCell>
                <TableCell className="font-medium">{EVENT_LABELS[event.type]}</TableCell>
                <TableCell>{triggerLabel(event.trigger)}</TableCell>
                <TableCell>
                  {event.actor === "system"
                    ? "Automatic"
                    : props.showInternal
                      ? (event.actorEmail ?? "Admin")
                      : "coss.com"}
                </TableCell>
                {props.showInternal ? (
                  <TableCell className="max-w-xs whitespace-normal text-muted-foreground">
                    {event.note ?? "—"}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
