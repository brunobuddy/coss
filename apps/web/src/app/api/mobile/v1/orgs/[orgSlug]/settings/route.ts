import type { OrganizationSettingsResponse } from "@coss/companion";
import { getHipaaMode } from "@coss/compliance";
import {
  hasScimConnection,
  listOrganizationMembers,
  readOrganizationApiVersion,
} from "@coss/tenancy";
import { versioning } from "@coss/versioning";
import { mobileRoute, requireMobileOrgMember } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

// The dashboard's General tab (apps/web/src/app/[orgSlug]/settings/page.tsx): every member may
// read it; only owners and admins change it (on coss.com).
export const GET = mobileRoute(
  async (request, ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/settings">) => {
    const { organization, session, can } = await requireMobileOrgMember(
      request,
      (await ctx.params).orgSlug,
    );
    const organizationId = organization.id;
    const readSso = can({ sso: ["read"] });
    const readScim = can({ scim: ["read"] });
    const [members, pinned, scimConnected, hipaa] = await Promise.all([
      listOrganizationMembers({ organizationId }),
      readOrganizationApiVersion({ organizationId }),
      readScim ? hasScimConnection({ organizationId }) : false,
      getHipaaMode(organizationId),
    ]);
    return {
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      can_update: can({ organization: ["update"] }),
      two_factor: {
        required: organization.requireTwoFactor,
        members_without: members.filter((row) => !row.user.twoFactorEnabled).length,
        members: members.length,
        you: Boolean(session.user.twoFactorEnabled),
      },
      sso: readSso ? { required: organization.requireSso } : null,
      scim: readScim ? { connected: scimConnected } : null,
      api_version: { pinned, latest: versioning.latest },
      hipaa_mode: hipaa && {
        enabled_at: hipaa.enabledAt.toISOString(),
        baa_signed_at: hipaa.baaSignedAt.toISOString(),
        baa_reference: hipaa.baaReference,
      },
      can: {
        read_billing: can({ billing: ["read"] }),
        read_sso: readSso,
        read_scim: readScim,
        read_audit: can({ audit: ["read"] }),
      },
    } satisfies OrganizationSettingsResponse;
  },
);
