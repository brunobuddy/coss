import { readSignedDocument, SignError } from "@coss/sign";
import { getEnvironment } from "@coss/tenancy";
import { requireOrgMember } from "@/lib/session";
import { signStore } from "@/lib/sign";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/sign/[requestId]/signed-document">;

/** The completed request's sealed PDF, for members who can read Sign. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const { orgSlug, projectSlug, envSlug, requestId } = await context.params;
  const { organization, can } = await requireOrgMember(orgSlug);
  const store = signStore();
  if (!can({ sign: ["read"] }) || !store) return new Response("Not found", { status: 404 });
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) return new Response("Not found", { status: 404 });
  try {
    const document = await readSignedDocument({
      organizationId: organization.id,
      environmentId: found.environment.id,
      requestId,
      store,
    });
    return new Response(Buffer.from(document.content), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.filename.replace(/[^\w.() -]/g, "_")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SignError) return new Response(error.message, { status: 404 });
    throw error;
  }
}
