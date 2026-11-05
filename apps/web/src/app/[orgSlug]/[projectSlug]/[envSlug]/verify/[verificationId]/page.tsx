import { VERIFICATION_REASONS } from "@coss/risk/schemas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { getVerification, VerifyError } from "@coss/verify";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { SEND_ROUTE_LABEL, VerificationStatusDot } from "@/components/verify-badges";
import { formatDateTime } from "@/lib/format";
import { verifyPageContext } from "../page-context";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/verify/[verificationId]">) {
  const { verificationId, ...rest } = await params;
  const { organization, environment, envPath } = await verifyPageContext(rest);
  const verification = await getVerification({
    organizationId: organization.id,
    environmentId: environment.id,
    verificationId,
  }).catch((error: unknown) => {
    if (error instanceof VerifyError) notFound();
    throw error;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={verification.channel === "sms" ? "A code by SMS." : "A code by email."}
        meta={<VerificationStatusDot status={verification.status} />}
        title={verification.to}
      />
      <Panel title="Details">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="ID" mono>
              {verification.id}
            </SpecItem>
            <SpecItem label="Channel">{verification.channel === "sms" ? "SMS" : "Email"}</SpecItem>
            {verification.country ? (
              <SpecItem label="Country">{verification.country}</SpecItem>
            ) : null}
            <SpecItem label="Wrong codes checked">
              {verification.attempts} of {verification.max_attempts}
            </SpecItem>
            {verification.failure ? (
              <SpecItem label="Failure">{verification.failure.message}</SpecItem>
            ) : null}
            <SpecItem label="Created">{formatDateTime(verification.created_at)}</SpecItem>
            <SpecItem label="Expires">{formatDateTime(verification.expires_at)}</SpecItem>
            {verification.approved_at ? (
              <SpecItem label="Approved">{formatDateTime(verification.approved_at)}</SpecItem>
            ) : null}
            {verification.tags.length > 0 ? (
              <SpecItem label="Tags" mono stacked>
                {verification.tags.map((tag) => `${tag.name}=${tag.value}`).join(", ")}
              </SpecItem>
            ) : null}
          </SpecList>
        </PanelBody>
      </Panel>

      {verification.reasons.length > 0 ? (
        <Panel
          description="The fraud guard stopped this verification before any code was sent: nothing was billed."
          title="Why it was blocked"
        >
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead>What it means</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verification.reasons.map((reason) => (
                <TableRow key={reason.code}>
                  <TableCell className="font-mono text-[0.8125rem]">
                    {reason.code}
                    {reason.value === undefined ? "" : ` (${reason.value})`}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {VERIFICATION_REASONS[reason.code as keyof typeof VERIFICATION_REASONS] ?? ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      {verification.sends.length > 0 ? (
        <Panel title="Codes sent">
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Sent</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verification.sends.map((send) => (
                <TableRow key={send.created_at}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(send.created_at)}
                  </TableCell>
                  <TableCell>{SEND_ROUTE_LABEL[send.route]}</TableCell>
                  <TableCell className="font-mono text-[0.8125rem]">
                    {send.sms_id ? (
                      <Link className="hover:underline" href={`${envPath}/sms/${send.sms_id}`}>
                        {send.sms_id}
                      </Link>
                    ) : send.email_id ? (
                      <Link
                        className="hover:underline"
                        href={`${envPath}/email/messages/${send.email_id}`}
                      >
                        {send.email_id}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">coss.com's</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
    </div>
  );
}
