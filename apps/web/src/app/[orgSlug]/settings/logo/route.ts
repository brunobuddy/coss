import { getOrganizationLogo } from "@coss/tenancy";
import type { NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/session";

/**
 * The organization's logo, found on its website by the worker. `?v=` names the version the page
 * asked for (`organizationLogoVersions`): then the image can be cached for good.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/[orgSlug]/settings/logo">) {
  const { orgSlug } = await ctx.params;
  const { organization } = await requireOrgMember(orgSlug);
  const logo = await getOrganizationLogo(organization.id);
  if (!logo) return new Response(null, { status: 404 });
  const etag = `"${logo.sha256}"`;
  const versioned = request.nextUrl.searchParams.get("v") === logo.sha256.slice(0, 12);
  const headers = {
    "Content-Type": logo.contentType,
    ETag: etag,
    "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(logo.image), { headers });
}
