import { db } from "@coss/db";
import { escapeHtml, type FormRow, formEndpoint, hostedOf, listFormSubmissions } from "@coss/forms";
import type { FormSubmissionStatus } from "@coss/forms/schemas";
import { resolveRiskSettings } from "@coss/risk";
import { Button } from "@coss/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/code-block";
import { CopyValue } from "@/components/copy-value";
import { CursorPager } from "@/components/cursor-pager";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { FormSubmissionStatusDot } from "@/components/form-badges";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { formsUrl } from "@/lib/forms";
import { formPageContext } from "../page-context";

type FormFieldDefinition = NonNullable<FormRow["fields"]>[number];

/** A field for the HTML sample of a form without definitions. */
function sampleField(
  name: string,
  type: FormFieldDefinition["type"],
  required: boolean,
): FormFieldDefinition {
  return { name, type, required, label: null, placeholder: null, options: [], maxLength: null };
}

/** The sample's control for a field, as the endpoint expects it (files need multipart). */
function sampleControl(field: FormFieldDefinition): string[] {
  const name = escapeHtml(field.name);
  const required = field.required ? " required" : "";
  const option = (value: string) => escapeHtml(value);
  switch (field.type) {
    case "hidden":
      // Its value is the page's to set (a campaign, a plan…); a required one must be there.
      return [
        `  <!-- ${name}: set its value${field.required ? " (required)" : ""} -->`,
        `  <input type="hidden" name="${name}" value="">`,
      ];
    case "textarea":
      return [`  <textarea name="${name}"${required}></textarea>`];
    case "select":
      return [
        `  <select name="${name}"${required}>`,
        ...field.options.map((value) => `    <option>${option(value)}</option>`),
        "  </select>",
      ];
    case "radio":
    case "checkbox":
      return field.options.length > 0
        ? field.options.map(
            (value) =>
              `  <label><input type="${field.type}" name="${name}" value="${option(value)}"> ${option(value)}</label>`,
          )
        : [
            `  <label><input type="checkbox" name="${name}" value="yes"${required}> ${name}</label>`,
          ];
    default:
      return [`  <input type="${field.type}" name="${name}"${required}>`];
  }
}

export const metadata: Metadata = { title: "Form" };

const PAGE_SIZE = 50;

const FILTERS: { value: string; label: string; statuses: FormSubmissionStatus[] }[] = [
  { value: "inbox", label: "Inbox", statuses: ["accepted"] },
  { value: "held", label: "Held", statuses: ["held"] },
  { value: "spam", label: "Spam", statuses: ["spam"] },
  { value: "pending", label: "Unconfirmed", statuses: ["pending_confirmation"] },
];

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function preview(data: Record<string, string | string[]>, emailField: string): string {
  return Object.entries(data)
    .filter(([name]) => name !== emailField)
    .map(([, value]) => (Array.isArray(value) ? value.join(", ") : value))
    .filter(Boolean)
    .join(" · ")
    .slice(0, 120);
}

export default async function FormPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]">) {
  const { organization, environment, form, formPath, can } = await formPageContext(await params);
  const search = await searchParams;
  const filter = FILTERS.find((option) => option.value === single(search.status)) ?? FILTERS[0];
  const after = single(search.after);
  const page = await listFormSubmissions({
    organizationId: organization.id,
    environmentId: environment.id,
    formId: form.id,
    status: filter?.statuses,
    limit: PAGE_SIZE,
    after,
  });
  const url = formsUrl();
  const endpoint = url ? formEndpoint({ publicUrl: url }, form.id) : null;
  const query = (extra: Record<string, string>) => {
    const values = {
      ...(filter && filter.value !== "inbox" ? { status: filter.value } : {}),
      ...extra,
    };
    const encoded = new URLSearchParams(values).toString();
    return encoded ? `${formPath}?${encoded}` : formPath;
  };
  const last = page.data.at(-1);
  const sampleFields: FormFieldDefinition[] = form.fields ?? [
    sampleField(form.emailField, "email", true),
    sampleField("name", "text", false),
    sampleField("message", "textarea", false),
  ];
  const uploads = sampleFields.some((field) => field.type === "file");
  // A required captcha needs its widget in the form: its token is posted with the fields.
  const captcha =
    form.captcha === "required"
      ? ((
          await resolveRiskSettings(db, {
            organizationId: organization.id,
            environmentId: environment.id,
          })
        ).captcha?.provider ?? null)
      : null;
  const siteKey = escapeHtml(form.captchaSiteKey ?? "your-site-key");
  const htmlSample = endpoint
    ? [
        ...(captcha === "turnstile"
          ? [
              '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
            ]
          : captcha === "hcaptcha"
            ? ['<script src="https://js.hcaptcha.com/1/api.js" async defer></script>']
            : []),
        `<form action="${endpoint}" method="POST"${uploads ? ' enctype="multipart/form-data"' : ""}>`,
        ...sampleFields.flatMap(sampleControl),
        ...(captcha === "turnstile"
          ? [`  <div class="cf-turnstile" data-sitekey="${siteKey}"></div>`]
          : captcha === "hcaptcha"
            ? [`  <div class="h-captcha" data-sitekey="${siteKey}"></div>`]
            : []),
        `  <input type="text" name="${form.honeypotField}" style="display:none" tabindex="-1" autocomplete="off">`,
        `  <button type="submit">Send</button>`,
        "</form>",
      ].join("\n")
    : "";
  const jsSample = endpoint
    ? [
        'import { attachForm } from "coss/forms";',
        "",
        `// <form id="contact" action="${endpoint}" method="POST">…</form>`,
        'attachForm(document.querySelector("#contact"), {',
        "  onResult(result) {",
        '    if (result.ok) alert("Thanks!");',
        "    else console.log(result.errors ?? result.error);",
        "  },",
        "});",
      ].join("\n")
    : "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              render={
                <Link
                  href={`${formPath}/export?status=${filter?.value ?? "inbox"}`}
                  prefetch={false}
                />
              }
              size="sm"
              variant="outline"
            >
              Export CSV
            </Button>
            {can({ form: ["update"] }) ? (
              <>
                <Button render={<Link href={`${formPath}/builder`} />} size="sm" variant="outline">
                  Fields and page
                </Button>
                <Button render={<Link href={`${formPath}/settings`} />} size="sm" variant="outline">
                  Settings
                </Button>
              </>
            ) : null}
          </div>
        }
        meta={
          <>
            <ModeBadge mode={environment.mode} />
            {form.disabledByAdminAt ? (
              <StatusDot tone="error">Disabled by coss.com</StatusDot>
            ) : form.enabled ? (
              <StatusDot tone="success">Accepting submissions</StatusDot>
            ) : (
              <StatusDot tone="neutral">Off</StatusDot>
            )}
          </>
        }
        title={form.name}
      />

      {endpoint ? (
        <Panel
          description={
            <>
              Point your form's <code className="font-mono">action</code> here, or submit it with{" "}
              <code className="font-mono">coss/forms</code> for JSON answers.
              {hostedOf(form).enabled && form.hostedPublishedAt
                ? " The hosted page is published at the same address."
                : ""}
            </>
          }
          title="Endpoint"
        >
          <PanelBody className="flex flex-col gap-4">
            <CopyValue value={endpoint} />
            <CodeBlock
              samples={[
                { label: "HTML", code: htmlSample },
                { label: "coss/forms", code: jsSample },
              ]}
            />
          </PanelBody>
        </Panel>
      ) : null}

      <FilterLinks
        options={FILTERS.map((option) => ({
          value: option.value,
          label: option.label,
          href: option.value === "inbox" ? formPath : `${formPath}?status=${option.value}`,
        }))}
        value={filter?.value ?? "inbox"}
      />
      <Panel
        footer={
          after || page.hasMore ? (
            <CursorPager
              newestHref={after ? query({}) : undefined}
              olderHref={page.hasMore && last ? query({ after: last.id }) : undefined}
            />
          ) : null
        }
      >
        {page.data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={
                filter?.value === "inbox" && !after ? (
                  <Button render={<a href="/docs/forms" />} size="sm" variant="outline">
                    Read the docs
                  </Button>
                ) : null
              }
              compact
              description={
                filter?.value === "inbox"
                  ? "Accepted submissions show up here (and go to your webhooks and notifications)."
                  : "Nothing here."
              }
              icon={InboxIcon}
              title={after ? "No more submissions" : "No submissions"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Submission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.data.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell>
                    <Link
                      className="hover:underline"
                      href={`${formPath}/submissions/${submission.id}`}
                    >
                      {submission.submitter_email ?? "Anonymous"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {preview(submission.data, form.emailField) || "—"}
                  </TableCell>
                  <TableCell>
                    <FormSubmissionStatusDot status={submission.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(submission.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
