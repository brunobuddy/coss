import { FormError, getFormSubmission } from "@coss/forms";
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
import { FormSubmissionStatusDot, SPAM_REASON_LABEL } from "@/components/form-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { formatDateTime } from "@/lib/format";
import { DeleteSubmissionButton, ReleaseButton } from "../../../form-actions";
import { formPageContext } from "../../../page-context";

export const metadata: Metadata = { title: "Submission" };

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default async function SubmissionPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/submissions/[submissionId]">) {
  const resolved = await params;
  const { organization, environment, envPath, form, formPath, can, target } =
    await formPageContext(resolved);
  const submission = await getFormSubmission({
    organizationId: organization.id,
    environmentId: environment.id,
    formId: form.id,
    submissionId: resolved.submissionId,
  }).catch((error: unknown) => {
    if (error instanceof FormError) notFound();
    throw error;
  });
  const labels = new Map(form.fields?.map((field) => [field.name, field.label ?? field.name]));
  const ids = { ...target, formId: form.id, submissionId: submission.id };
  const releasable = submission.status === "held" || submission.status === "spam";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {releasable && can({ form: ["update"] }) ? <ReleaseButton {...ids} /> : null}
            {can({ form: ["delete"] }) ? <DeleteSubmissionButton {...ids} /> : null}
          </div>
        }
        meta={
          <>
            <FormSubmissionStatusDot status={submission.status} />
            <span className="font-mono text-xs">{submission.id}</span>
          </>
        }
        title={submission.submitter_email ?? "Anonymous submission"}
      />
      {submission.spam_reason ? (
        <p className="rounded-lg border px-4 py-3 text-sm">
          {SPAM_REASON_LABEL[submission.spam_reason]}.{" "}
          {releasable
            ? "Nothing was delivered: release it if it's real, and Risk learns from it."
            : null}
        </p>
      ) : null}
      <Panel title="Fields">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(submission.data).map(([name, value]) => (
              <TableRow key={name}>
                <TableCell className="w-48 align-top text-muted-foreground">
                  {labels.get(name) ?? name}
                </TableCell>
                <TableCell className="whitespace-pre-wrap break-words">
                  {Array.isArray(value) ? value.join(", ") : value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      {submission.files.length > 0 ? (
        <Panel description="Uploaded by the submitter: open them with care." title="Files">
          <Table variant="card">
            <TableBody>
              {submission.files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <a
                      className="hover:underline"
                      href={`${formPath}/submissions/${submission.id}/files/${file.id}`}
                    >
                      {file.filename}
                    </a>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {file.content_type}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {formatBytes(file.size)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      ) : null}
      <Panel title="Details">
        <PanelBody flush>
          <SpecList columns={2}>
            <SpecItem label="Received">{formatDateTime(submission.created_at)}</SpecItem>
            <SpecItem label="Delivered">
              {submission.accepted_at ? formatDateTime(submission.accepted_at) : "—"}
            </SpecItem>
            <SpecItem label="Risk">
              {submission.risk?.assessment_id ? (
                <Link
                  className="hover:underline"
                  href={`${envPath}/risk/${submission.risk.assessment_id}`}
                >
                  {submission.risk.decision ?? "—"}
                  {submission.risk.score === null ? "" : ` (${submission.risk.score})`}
                </Link>
              ) : (
                "Not assessed"
              )}
            </SpecItem>
            <SpecItem label="Confirmed by the submitter">
              {submission.confirmed_at ? formatDateTime(submission.confirmed_at) : "—"}
            </SpecItem>
            <SpecItem label="From page" mono>
              {submission.referrer ?? submission.origin ?? "—"}
            </SpecItem>
            <SpecItem label="IP address" mono>
              {submission.ip ?? "—"}
            </SpecItem>
            <SpecItem label="Browser" stacked>
              {submission.user_agent ?? "—"}
            </SpecItem>
          </SpecList>
        </PanelBody>
      </Panel>
    </div>
  );
}
