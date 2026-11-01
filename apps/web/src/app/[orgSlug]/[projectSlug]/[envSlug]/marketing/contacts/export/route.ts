import { orgRoleCan } from "@coss/auth/permissions";
import { contactsCsvStream, listContactProperties } from "@coss/email";
import { ExportContactsQuery } from "@coss/email/contact-schemas";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/session";

/** The environment's contacts as CSV (`?status=` / `?audience_id=` filter them). */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/contacts/export">,
) {
  const { orgSlug, projectSlug, envSlug } = await ctx.params;
  const { organization, member } = await requireOrgMember(orgSlug);
  if (!orgRoleCan(member.role, { contact: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const query = ExportContactsQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return new Response("Invalid filter.", { status: 400 });
  const env = { organizationId: organization.id, environmentId: found.environment.id };
  const keys = (await listContactProperties(env)).map((property) => property.key);
  const filename = `contacts-${found.project.slug}-${found.environment.slug}.csv`;
  return new Response(contactsCsvStream(env, query.data, keys), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
