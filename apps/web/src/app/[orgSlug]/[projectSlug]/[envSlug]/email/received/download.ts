import "server-only";
import { orgRoleCan } from "@coss/auth/permissions";
import { getEnvironment } from "@coss/tenancy";
import { notFound } from "next/navigation";
import { emailRuntime } from "@/lib/email-runtime";
import { requireOrgMember } from "@/lib/session";

/**
 * The environment and content store a download is for, after the member's `email:read` check
 * (anything else is a 404, like a missing email).
 */
export async function downloadScope(params: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
}) {
  const { organization, member } = await requireOrgMember(params.orgSlug);
  if (!orgRoleCan(member.role, { email: ["read"] })) notFound();
  const found = await getEnvironment({
    organizationId: organization.id,
    projectSlug: params.projectSlug,
    envSlug: params.envSlug,
  });
  const inbound = emailRuntime().inbound;
  if (!found || !inbound) notFound();
  return {
    scope: { organizationId: organization.id, environmentId: found.environment.id },
    store: inbound.store,
  };
}

/**
 * Third-party content served from the dashboard's own origin: always a download (never rendered)
 * and never sniffed into something executable. Its sandboxing CSP comes from `next.config.ts`
 * (`RECEIVED_CONTENT_PATHS`): config headers replace a route's own.
 */
export function downloadResponse(content: Uint8Array, contentType: string, filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return new Response(content as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
