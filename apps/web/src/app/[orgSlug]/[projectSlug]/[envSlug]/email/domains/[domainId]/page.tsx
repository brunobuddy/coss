import { environmentHref } from "@coss/dashboard-routes";
import {
  type DomainBimiObjectOutput,
  type DomainRecord,
  type DomainRow,
  domainRecords,
  getDomain,
  getEmailTenant,
  getReceivingDomain,
  getTrackingDomain,
  type ReceivingDomainRow,
  type TrackingDomainRow,
  toBimiObject,
} from "@coss/email";
import { listEnvironments, listProjects } from "@coss/tenancy";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { CopyValue } from "@/components/copy-value";
import {
  BimiStatusBadge,
  DomainStatusBadge,
  RecordStatusBadge,
  TrackingDomainStatusBadge,
} from "@/components/domain-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SendingPausedAlert } from "@/components/sending-paused-alert";
import { SpecItem, SpecList } from "@/components/spec-list";
import { SubNav } from "@/components/sub-nav";
import { planHas } from "@/lib/billing";
import { domainConnectPlan } from "@/lib/domain-connect";
import { emailRuntime } from "@/lib/email-runtime";
import { formatDateTime } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import {
  DeleteDomainButton,
  ShareWithSubaccountsSwitch,
  VerifyDomainButton,
} from "./domain-actions";
import { DomainConnectButton, DomainConnectReturn } from "./domain-connect";
import {
  AddReceivingDomainDialog,
  CheckReceivingDomainButton,
  type EnvironmentOption,
  RemoveReceivingDomainButton,
} from "./receiving-domain-actions";
import {
  AddTrackingDomainDialog,
  CheckTrackingDomainButton,
  RemoveTrackingDomainButton,
} from "./tracking-domain-actions";

export const metadata: Metadata = { title: "Domain" };

const PURPOSE: Record<DomainRecord["purpose"], string> = {
  dkim: "DKIM: proves emails from this domain are really from you.",
  mail_from_mx: "MAIL FROM: receives bounces and complaints.",
  mail_from_spf: "SPF: authorizes the provider to send for the MAIL FROM subdomain.",
  dmarc:
    "DMARC (recommended): tells mailbox providers what to do with unauthenticated mail, and sends you reports (DMARC tab).",
};

const STATUS_HELP = {
  pending:
    "Publish the records below at your DNS provider. Verification usually takes a few minutes, " +
    "sometimes up to 72 hours; we check automatically.",
  verified: "Live API keys can send from any address at this domain.",
  temporary_failure:
    "The DKIM records can't be found right now. Sending is blocked until they are back.",
  failed:
    "The records weren't found within 72 hours, so verification stopped. Restart it to get new " +
    "records to publish.",
  deleting: "This domain is being removed. If it stays here, delete it again to finish.",
} as const;

const TRACKING_STATUS_HELP = {
  pending:
    "Publish the CNAME record below. Once it resolves, a certificate is issued for the hostname " +
    "(usually within minutes, at most 72 hours); we check automatically.",
  active: "Open pixels and click links of emails sent from this domain use this hostname.",
  temporary_failure:
    "The hostname stopped working, so emails use coss.com's tracking host until it is back. Check " +
    "that the CNAME record is still in place.",
  failed:
    "The hostname couldn't be set up within 72 hours, so setup stopped. Fix the CNAME record, " +
    "then restart it.",
  deleting: "This tracking domain is being removed.",
} as const satisfies Record<TrackingDomainRow["status"], string>;

/** DNS providers usually want the host relative to the zone; showing the full name is clearest. */
function RecordRow({
  record,
  purpose,
}: {
  record: Pick<DomainRecord, "type" | "name" | "value" | "found" | "status"> & {
    priority?: number | null;
  };
  purpose?: string;
}) {
  const value =
    record.priority === null || record.priority === undefined
      ? record.value
      : `${record.priority} ${record.value}`;
  return (
    <TableRow>
      <TableCell className="align-top font-mono text-xs leading-7">{record.type}</TableCell>
      <TableCell className="min-w-0 whitespace-normal align-top leading-normal">
        <div className="flex flex-col gap-0.5">
          <CopyValue value={record.name} />
          {purpose ? <span className="text-muted-foreground text-xs">{purpose}</span> : null}
        </div>
      </TableCell>
      <TableCell className="min-w-0 whitespace-normal align-top leading-normal">
        <div className="flex flex-col gap-0.5">
          <CopyValue display={value} value={record.value} />
          {record.found.length > 0 ? (
            <span className="break-all font-mono text-destructive-foreground text-xs">
              Found: {record.found.join(", ")}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="align-top leading-7">
        <RecordStatusBadge status={record.status} />
      </TableCell>
    </TableRow>
  );
}

function RecordsTable({ children }: { children: ReactNode }) {
  return (
    <Table className="table-fixed" variant="card">
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="w-32">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

/**
 * "Connect with <DNS provider>" when the domain's provider supports Domain Connect and something is
 * left to add. Streams in on its own: discovery asks the customer's DNS and provider.
 */
async function DomainConnectAction(props: {
  domain: DomainRow;
  tracking: TrackingDomainRow | null;
  target: { orgSlug: string; domainId: string };
}) {
  const plan = await domainConnectPlan(props.domain, props.tracking);
  if (!plan) return null;
  return <DomainConnectButton {...props.target} providerName={plan.provider.providerName} />;
}

export default async function DomainPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/email/domains/[domainId]">) {
  const { orgSlug, projectSlug, envSlug, domainId } = await params;
  const envBase = environmentHref({
    organization: orgSlug,
    project: projectSlug,
    environment: envSlug,
  });
  const query = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ domain: ["read"] })) notFound();
  const [domain, tenant] = await Promise.all([
    getDomain({ organizationId: organization.id, id: domainId }),
    getEmailTenant(organization.id),
  ]);
  if (!domain) notFound();
  const [tracking, receiving, projects] = await Promise.all([
    getTrackingDomain({ organizationId: organization.id, domainId: domain.id }),
    getReceivingDomain({ organizationId: organization.id, domainId: domain.id }),
    listProjects({ organizationId: organization.id }),
  ]);
  // Where received emails can go: every environment of the organization ("Project / Environment").
  const environments = (
    await Promise.all(
      projects.map(async (project) =>
        (
          await listEnvironments({ organizationId: organization.id, projectId: project.id })
        ).map((environment) => ({ project, environment })),
      ),
    )
  ).flat();
  const records = domainRecords(domain, emailRuntime().domainDeps.dmarcReportDomain ?? null);
  const canCreate = can({ domain: ["create"] });
  const canVerify = can({ domain: ["verify"] });
  const canDelete = can({ domain: ["delete"] });
  const target = { orgSlug: organization.slug, domainId: domain.id };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <>
            {canVerify && domain.status !== "deleting" ? (
              <VerifyDomainButton {...target} restart={domain.status === "failed"} />
            ) : null}
            {/* Also while `deleting`: a deletion interrupted midway is finished by trying again. */}
            {canDelete ? <DeleteDomainButton {...target} name={domain.name} /> : null}
          </>
        }
        description={STATUS_HELP[domain.status]}
        meta={<DomainStatusBadge status={domain.status} />}
        title={<span className="font-mono tracking-[-0.03em]">{domain.name}</span>}
      />
      <SubNav base={`${envBase}/email/domains/${domain.id}`} className="border-b" nav="domain" />

      {tenant?.sendingStatus === "disabled" ? (
        <SendingPausedAlert cause={tenant.statusCause} />
      ) : null}

      {domain.provider === "fake" ? (
        <Alert variant="info">
          <AlertDescription>
            This domain uses the fake email provider (local development): it verifies without DNS,
            and these records are not checked.
          </AlertDescription>
        </Alert>
      ) : null}

      {canVerify && query.dns_connect === "done" ? (
        <DomainConnectReturn
          {...target}
          error={typeof query.error === "string" ? query.error : null}
        />
      ) : null}

      <Panel
        action={
          canVerify && domain.status !== "failed" && domain.status !== "deleting" ? (
            <Suspense fallback={null}>
              <DomainConnectAction domain={domain} target={target} tracking={tracking} />
            </Suspense>
          ) : null
        }
        description={`Add these at your DNS provider. Last checked ${formatDateTime(domain.lastCheckedAt)}.`}
        title="DNS records"
      >
        <RecordsTable>
          {records.map((record) => (
            <RecordRow
              key={`${record.type} ${record.name} ${record.value}`}
              purpose={PURPOSE[record.purpose]}
              record={record}
            />
          ))}
        </RecordsTable>
      </Panel>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <TrackingDomainPanel
            canCreate={canCreate && domain.status !== "failed" && domain.status !== "deleting"}
            canDelete={canDelete}
            canVerify={canVerify}
            domainName={domain.name}
            planAllows={await planHas(organization.id, "trackingDomains")}
            target={target}
            tracking={tracking}
          />
          <ReceivingDomainPanel
            available={emailRuntime().inbound !== null}
            canCreate={canCreate && domain.status !== "failed" && domain.status !== "deleting"}
            canDelete={canDelete}
            canVerify={canVerify}
            domainName={domain.name}
            environments={environments.map(({ project, environment }) => ({
              value: environment.id,
              label: `${project.name} / ${environment.name}`,
              href: `/${organization.slug}/${project.slug}/${environment.slug}/email/received`,
            }))}
            receiving={receiving}
            target={target}
          />
          <BimiPanel
            bimi={toBimiObject(domain)}
            domainName={domain.name}
            fake={domain.provider === "fake"}
            lastCheckedAt={domain.lastCheckedAt}
          />
        </div>
        <Panel title="Details">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="MAIL FROM" mono>
                {domain.mailFromDomain}
              </SpecItem>
              <SpecItem label="MAIL FROM status">
                {domain.mailFromStatus.replaceAll("_", " ")}
              </SpecItem>
              <SpecItem label="Verified">{formatDateTime(domain.verifiedAt)}</SpecItem>
              <SpecItem label="Added">{formatDateTime(domain.createdAt)}</SpecItem>
              {domain.subaccountId ? (
                <SpecItem label="Sub-account" mono>
                  <span className="truncate">{domain.subaccountId}</span>
                </SpecItem>
              ) : (
                <SpecItem label="Shared with sub-accounts">
                  <ShareWithSubaccountsSwitch
                    disabled={!canCreate}
                    domainId={domain.id}
                    orgSlug={organization.slug}
                    shared={domain.sharedWithSubaccounts}
                  />
                </SpecItem>
              )}
              <SpecItem label="ID" mono>
                <span className="truncate">{domain.id}</span>
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function TrackingDomainPanel(props: {
  tracking: TrackingDomainRow | null;
  domainName: string;
  target: { orgSlug: string; domainId: string };
  canCreate: boolean;
  /** The plan includes custom tracking domains (one set up earlier keeps working regardless). */
  planAllows: boolean;
  canVerify: boolean;
  canDelete: boolean;
}) {
  const { tracking, target } = props;
  if (!tracking) {
    return (
      <Panel
        action={
          props.canCreate && props.planAllows ? (
            <AddTrackingDomainDialog {...target} domainName={props.domainName} />
          ) : null
        }
        description={
          <>
            Serve open and click tracking links of emails from {props.domainName} on your own
            subdomain, such as <code className="font-mono">links.{props.domainName}</code>, instead
            of coss.com&apos;s tracking host.
          </>
        }
        title="Tracking domain"
      >
        {props.canCreate && !props.planAllows ? (
          <PanelBody className="text-sm">
            Custom tracking domains are part of the Pro plan and above.{" "}
            <Link
              className="underline underline-offset-4"
              href={`/${target.orgSlug}/settings/billing/plans`}
            >
              Compare plans
            </Link>
          </PanelBody>
        ) : null}
      </Panel>
    );
  }
  const record = tracking.record;
  return (
    <Panel
      action={
        tracking.status !== "deleting" ? (
          <>
            {props.canVerify ? (
              <CheckTrackingDomainButton {...target} restart={tracking.status === "failed"} />
            ) : null}
            {props.canDelete ? (
              <RemoveTrackingDomainButton {...target} hostname={tracking.hostname} />
            ) : null}
          </>
        ) : null
      }
      description={`${TRACKING_STATUS_HELP[tracking.status]} Last checked ${formatDateTime(tracking.lastCheckedAt)}.`}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Tracking domain <code className="font-mono font-normal text-sm">{tracking.hostname}</code>
          <TrackingDomainStatusBadge status={tracking.status} />
        </span>
      }
    >
      {tracking.providerMessage && tracking.status !== "active" ? (
        <div className="px-1 pb-1">
          <Alert variant="warning">
            <AlertDescription>{tracking.providerMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {tracking.provider === "fake" ? (
        <div className="px-1 pb-1">
          <Alert variant="info">
            <AlertDescription>
              This tracking domain uses the fake certificate provider (local development): it is
              active without DNS, but nothing serves it.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <RecordsTable>
        <RecordRow record={record} />
      </RecordsTable>
    </Panel>
  );
}

function ReceivingDomainPanel(props: {
  receiving: ReceivingDomainRow | null;
  available: boolean;
  domainName: string;
  environments: (EnvironmentOption & { href: string })[];
  target: { orgSlug: string; domainId: string };
  canCreate: boolean;
  canVerify: boolean;
  canDelete: boolean;
}) {
  const { receiving, target } = props;
  if (!receiving) {
    return (
      <Panel
        action={
          props.canCreate && props.available && props.environments.length > 0 ? (
            <AddReceivingDomainDialog
              {...target}
              domainName={props.domainName}
              environments={props.environments.map(({ value, label }) => ({ value, label }))}
            />
          ) : null
        }
        description={
          <>
            Receive email at {props.domainName} or a subdomain such as inbound.{props.domainName}:
            every message becomes a received email of an environment, with an{" "}
            <code className="font-mono">email.received</code> webhook.
          </>
        }
        title="Receiving"
      >
        {!props.available ? (
          <PanelBody>
            <Alert variant="info">
              <AlertDescription>This deployment does not receive email.</AlertDescription>
            </Alert>
          </PanelBody>
        ) : null}
      </Panel>
    );
  }
  const record = receiving.record;
  const destination = props.environments.find((env) => env.value === receiving.environmentId);
  return (
    <Panel
      action={
        <>
          {props.canVerify && props.available ? <CheckReceivingDomainButton {...target} /> : null}
          {props.canDelete ? (
            <RemoveReceivingDomainButton {...target} hostname={receiving.hostname} />
          ) : null}
        </>
      }
      description={
        <>
          Email to any address at {receiving.hostname} is received by{" "}
          {destination ? (
            <Link className="underline underline-offset-4" href={destination.href}>
              {destination.label}
            </Link>
          ) : (
            "an environment"
          )}
          . Last checked {formatDateTime(receiving.lastCheckedAt)}.
        </>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          Receiving <code className="font-mono font-normal text-sm">{receiving.hostname}</code>
        </span>
      }
    >
      {record.status === "mismatch" ? (
        <div className="px-1 pb-1">
          <Alert variant="warning">
            <AlertDescription>
              Mail for {receiving.hostname} goes to its most preferred MX records, which don&apos;t
              all point at coss.com yet.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <RecordsTable>
        <RecordRow purpose="MX: delivers this hostname's email to coss.com." record={record} />
      </RecordsTable>
    </Panel>
  );
}

const BIMI_STATUS_HELP = {
  not_checked: "Not checked yet: we check it with the domain's DNS records.",
  missing:
    "Show your logo next to your emails in Gmail, Apple Mail, Yahoo and other inboxes. It takes a " +
    "BIMI record, a VMC or CMC certificate of your own and DMARC at enforcement.",
  invalid: "Mailbox providers won't show your logo until the problems below are fixed.",
  configured:
    "Mailbox providers can find your logo and certificate. They validate both themselves and " +
    "decide when to show the logo.",
} as const satisfies Record<DomainBimiObjectOutput["status"], string>;

/** BIMI is DNS only: the logo and certificate are the customer's, and never fetched here. */
function BimiPanel(props: {
  bimi: DomainBimiObjectOutput;
  domainName: string;
  fake: boolean;
  lastCheckedAt: Date | null;
}) {
  const { bimi } = props;
  const found = bimi.status === "invalid" || bimi.status === "configured";
  return (
    <Panel
      description={
        <>
          {props.fake && bimi.status === "not_checked"
            ? "The fake email provider (local development) doesn't check DNS."
            : BIMI_STATUS_HELP[bimi.status]}{" "}
          {bimi.status !== "not_checked"
            ? `Last checked ${formatDateTime(props.lastCheckedAt)}. `
            : null}
          <a className="underline underline-offset-4" href="/docs/email/bimi">
            Setting up BIMI
          </a>
        </>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          Brand logo (BIMI)
          <BimiStatusBadge status={bimi.status} />
        </span>
      }
    >
      {bimi.issues.length > 0 ? (
        <div className="px-1 pb-1">
          <Alert variant="warning">
            <AlertDescription>
              <ul className="list-disc pl-4">
                {bimi.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {found ? (
        <PanelBody flush>
          <SpecList>
            <SpecItem label="Record" mono>
              <span className="break-all">{bimi.name}</span>
            </SpecItem>
            <SpecItem label="Value" mono stacked>
              <span className="break-all">{bimi.record}</span>
            </SpecItem>
            <SpecItem label="Logo" mono stacked>
              <span className="break-all">{bimi.logo_url ?? "None"}</span>
            </SpecItem>
            <SpecItem label="Certificate" mono stacked>
              <span className="break-all">{bimi.certificate_url ?? "None"}</span>
            </SpecItem>
            <SpecItem label="DMARC policy" mono>
              {bimi.dmarc_policy ?? "None"}
            </SpecItem>
          </SpecList>
        </PanelBody>
      ) : (
        <RecordsTable>
          <RecordRow
            purpose="BIMI: your SVG logo (l=) and its VMC or CMC certificate (a=), both served over HTTPS."
            record={{
              type: "TXT",
              name: bimi.name,
              value: `v=BIMI1; l=https://${props.domainName}/logo.svg; a=https://${props.domainName}/certificate.pem`,
              found: [],
              status: bimi.status === "missing" ? "missing" : "not_checked",
            }}
          />
        </RecordsTable>
      )}
    </Panel>
  );
}
