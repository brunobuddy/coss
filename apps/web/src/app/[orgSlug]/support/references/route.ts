import { orgRoleCan } from "@coss/auth/permissions";
import { recentEmailReferences, recentSmsReferences } from "@coss/support";
import { type NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/session";

/** Recent items of an environment, to reference from a ticket: only what the member can read. */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/[orgSlug]/support/references">,
) {
  const { orgSlug } = await ctx.params;
  const { organization, member } = await requireOrgMember(orgSlug);
  const environmentId = request.nextUrl.searchParams.get("environmentId") ?? "";
  const product = request.nextUrl.searchParams.get("product");
  const scope = { organizationId: organization.id, environmentId };
  let items: Awaited<ReturnType<typeof recentEmailReferences>> = [];
  if (product === "email" || product === "marketing") {
    if (orgRoleCan(member.role, { email: ["read"] })) items = await recentEmailReferences(scope);
  } else if (product === "sms") {
    if (orgRoleCan(member.role, { sms: ["read"] })) items = await recentSmsReferences(scope);
  }
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
