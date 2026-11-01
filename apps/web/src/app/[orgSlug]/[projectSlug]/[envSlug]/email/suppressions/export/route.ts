import { orgRoleCan } from "@coss/auth/permissions";
import { suppressionsCsvStream } from "@coss/email";
import { ExportSuppressionsQuery } from "@coss/email/schemas";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/session";

/** The environment's whole suppression list as CSV (`?scope=` / `?reason=` filter it). */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/email/suppressions/export">,
) {
  const { orgSlug, projectSlug, envSlug } = await ctx.params;
  const { organization, member } = await requireOrgMember(orgSlug);
  if (!orgRoleCan(member.role, { suppression: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const query = ExportSuppressionsQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return new Response("Invalid filter.", { status: 400 });
  const filename = `suppressions-${found.project.slug}-${found.environment.slug}.csv`;
  return new Response(
    suppressionsCsvStream(
      { organizationId: organization.id, environmentId: found.environment.id },
      query.data,
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
