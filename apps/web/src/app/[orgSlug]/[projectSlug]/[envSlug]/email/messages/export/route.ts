import { emailsCsvStream } from "@coss/email";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { emailFilterParams, toEmailListFilters } from "@/lib/email-filters";
import { requireOrgMember } from "@/lib/session";

/** The emails the list shows (same filters, every page) as CSV, newest first. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/email/messages/export">,
) {
  const { orgSlug, projectSlug, envSlug } = await ctx.params;
  const { organization } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const search = request.nextUrl.searchParams;
  const filters = emailFilterParams((name) => search.get(name)?.trim() ?? "");
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "");
  const filename = `emails-${found.project.slug}-${found.environment.slug}-${stamp}.csv`;
  return new Response(
    emailsCsvStream({
      organizationId: organization.id,
      environmentId: found.environment.id,
      ...toEmailListFilters(filters),
    }),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
