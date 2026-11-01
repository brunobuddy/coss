import { getFormRow, listFormSubmissions } from "@coss/forms";
import type { FormSubmissionStatus } from "@coss/forms/schemas";
import { getEnvironment } from "@coss/tenancy";
import { requireOrgMember } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/export">;

const STATUSES: Record<string, FormSubmissionStatus[]> = {
  inbox: ["accepted"],
  held: ["held"],
  spam: ["spam"],
  pending: ["pending_confirmation"],
  all: [],
};
/** Rows in one export; older ones are left out (newest first). */
const MAX_ROWS = 10_000;
/** Submitted text in one export (built in memory): about this much CSV, plus the empty cells. */
const MAX_BYTES = 32 * 1024 * 1024;
/** Columns of their own; answers to further fields share `other_fields`. */
const MAX_COLUMNS = 200;

/** A CSV cell; formula-like values get a leading `'` so spreadsheets show them as text. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The form's submissions (one status filter) as CSV, newest first. */
export async function GET(request: Request, context: Context): Promise<Response> {
  const { orgSlug, projectSlug, envSlug, formId } = await context.params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ form: ["read"] })) return new Response("Not found", { status: 404 });
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) return new Response("Not found", { status: 404 });
  const scope = { organizationId: organization.id, environmentId: found.environment.id, formId };
  const form = await getFormRow(scope);
  if (!form) return new Response("Not found", { status: 404 });
  const status = new URL(request.url).searchParams.get("status") ?? "inbox";
  const statuses = STATUSES[status] ?? STATUSES.inbox;

  // Bounded in bytes as well as rows (forms without definitions take any field), and named
  // `-partial` when it stops early.
  const rows: Awaited<ReturnType<typeof listFormSubmissions>>["data"] = [];
  let after: string | undefined;
  let bytes = 0;
  let partial = false;
  for (;;) {
    const page = await listFormSubmissions({ ...scope, status: statuses, limit: 100, after });
    for (const row of page.data) {
      if (rows.length >= MAX_ROWS || bytes >= MAX_BYTES) {
        partial = true;
        break;
      }
      rows.push(row);
      bytes += JSON.stringify(row.data).length;
    }
    const last = page.data.at(-1);
    if (partial || !page.hasMore || !last) break;
    if (rows.length >= MAX_ROWS || bytes >= MAX_BYTES) {
      partial = true;
      break;
    }
    after = last.id;
  }
  // The defined fields first (file fields are the last column, by filename), then whatever else
  // was submitted, whatever the field is now (undefined fields, fields since renamed, removed or
  // turned into uploads), up to MAX_COLUMNS; any further answers go to `other_fields` as JSON. An
  // export never drops an answer.
  const named = [
    ...new Set([
      ...(form.fields ?? []).filter((field) => field.type !== "file").map((field) => field.name),
      ...rows.flatMap((row) => Object.keys(row.data)),
    ]),
  ];
  const columns = named.slice(0, MAX_COLUMNS);
  const listed = new Set(columns);
  const overflow = named.length > columns.length;
  const header = [
    "id",
    "status",
    "created_at",
    "submitter_email",
    ...columns,
    ...(overflow ? ["other_fields"] : []),
    "files",
  ];
  const lines = [
    header.map(cell).join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.status,
        row.created_at,
        row.submitter_email ?? "",
        ...columns.map((name) => {
          const value = row.data[name];
          return Array.isArray(value) ? value.join("; ") : (value ?? "");
        }),
        ...(overflow
          ? [
              JSON.stringify(
                Object.fromEntries(Object.entries(row.data).filter(([name]) => !listed.has(name))),
              ),
            ]
          : []),
        row.files.map((file) => file.filename).join("; "),
      ]
        .map(cell)
        .join(","),
    ),
  ];
  const filename = `${form.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "form"}-${status}${partial ? "-partial" : ""}.csv`;
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
