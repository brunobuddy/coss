import { findSubaccount, listDomains, subaccountStats } from "@coss/email";
import type { CheckResult } from "@coss/reputation";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ArrowRightIcon, BarChart3Icon, GlobeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { REPUTATION_TONE, STATUS_TONE, subaccountPageContext } from "../page-context";
import {
  DeleteSubaccountButton,
  QuotasForm,
  ReinstateButton,
  StatusButton,
} from "../subaccount-actions";

export const metadata: Metadata = { title: "Sub-account" };

/** The checks of its last evaluation (`metrics`), if any. */
function lastChecks(metrics: unknown): CheckResult[] {
  const checks = (metrics as { checks?: unknown } | null)?.checks;
  return Array.isArray(checks) ? (checks as CheckResult[]) : [];
}

export default async function SubaccountPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/subaccounts/[subaccountId]">) {
  const { subaccountId, ...envParams } = await params;
  const { can, organization, environment, envPath, target } =
    await subaccountPageContext(envParams);
  const row = await findSubaccount({
    organizationId: organization.id,
    environmentId: environment.id,
    ref: subaccountId,
  });
  if (!row) notFound();
  const [domains, stats] = await Promise.all([
    listDomains({ organizationId: organization.id, subaccountId: row.id }),
    subaccountStats({
      organizationId: organization.id,
      subaccountId: row.id,
      from: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }),
  ]);
  const rowTarget = { ...target, subaccountId: row.id };
  const emailsHref = `${envPath}/email/messages?${new URLSearchParams({ subaccount: row.id })}`;
  const editable = row.status !== "deleting" && can({ subaccount: ["update"] });
  const [statusTone, statusLabel] = STATUS_TONE[row.status];
  const [reputationTone, reputationLabel] = REPUTATION_TONE[row.reputationStatus];
  const checks = lastChecks(row.metrics);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {editable && row.reputationStatus !== "good" ? (
              <ReinstateButton {...rowTarget} name={row.name} />
            ) : null}
            {editable ? <StatusButton {...rowTarget} disabled={row.status === "disabled"} /> : null}
            {row.status !== "deleting" && can({ subaccount: ["delete"] }) ? (
              <DeleteSubaccountButton {...rowTarget} name={row.name} />
            ) : null}
          </>
        }
        meta={
          <>
            <code className="font-mono text-xs">{row.id}</code>
            {row.uid ? <code className="font-mono text-xs">uid {row.uid}</code> : null}
          </>
        }
        title={row.name}
      />

      <Panel title="Standing">
        <SpecList columns={2}>
          <SpecItem label="Status">
            <StatusDot tone={statusTone}>{statusLabel}</StatusDot>
          </SpecItem>
          <SpecItem label="Reputation">
            <StatusDot tone={reputationTone}>{reputationLabel}</StatusDot>
          </SpecItem>
          <SpecItem label="Changed by" mono>
            {row.reputationTrigger ?? "—"}
          </SpecItem>
          <SpecItem label="Changed">
            {row.reputationChangedAt ? formatDateTime(row.reputationChangedAt) : "—"}
          </SpecItem>
          {checks.map((check) => (
            <SpecItem key={check.trigger} label={check.trigger.replaceAll("_", " ")}>
              {check.message}
            </SpecItem>
          ))}
        </SpecList>
      </Panel>

      <Panel
        description="On top of your organization's quotas. Sends over one are refused (429)."
        title="Quotas"
      >
        <PanelBody>
          {editable ? (
            <QuotasForm
              {...rowTarget}
              burst={row.perSecondBurst}
              perDay={row.dailyRecipientLimit}
              perSecond={row.perSecondRecipientLimit}
            />
          ) : (
            <SpecList>
              <SpecItem label="Recipients per day" mono>
                {row.dailyRecipientLimit?.toLocaleString("en-US") ?? "None"}
              </SpecItem>
              <SpecItem label="Recipients per second" mono>
                {row.perSecondRecipientLimit?.toLocaleString("en-US") ?? "None"}
              </SpecItem>
            </SpecList>
          )}
        </PanelBody>
      </Panel>

      <Panel
        description="Only this sub-account sends from them, through its own sending reputation. Add them with the API (POST /v1/domains with subaccount)."
        title="Domains"
      >
        {domains.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Without domains of its own it sends from the domains you share with sub-accounts."
              icon={GlobeIcon}
              title="No domains yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>
                    <Link
                      className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                      href={`${envPath}/email/domains/${domain.id}`}
                    >
                      {domain.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {domain.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        action={
          <Button render={<Link href={emailsHref} />} size="sm" variant="ghost">
            View emails
            <ArrowRightIcon />
          </Button>
        }
        description="Recipients per day over the last 14 days, by their current status."
        title="Sending"
      >
        {stats.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description={
                <>
                  Its emails show up here, and under{" "}
                  <Link className="underline" href={emailsHref}>
                    Emails
                  </Link>
                  .
                </>
              }
              icon={BarChart3Icon}
              title="Nothing sent yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Bounced</TableHead>
                <TableHead className="text-right">Complained</TableHead>
                <TableHead className="text-right">Suppressed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.data.map((day) => (
                <TableRow key={day.date}>
                  <TableCell className="font-mono text-xs">{day.date}</TableCell>
                  {[day.recipients, day.delivered, day.bounced, day.complained, day.suppressed].map(
                    (value, index) => (
                      <TableCell
                        className="text-right font-mono text-xs tabular-nums"
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
                        key={index}
                      >
                        {value.toLocaleString("en-US")}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
