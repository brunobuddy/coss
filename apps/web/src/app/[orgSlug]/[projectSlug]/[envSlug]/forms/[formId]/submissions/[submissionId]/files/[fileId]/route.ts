import { FormError, readFormSubmissionFile } from "@coss/forms";
import { getEnvironment } from "@coss/tenancy";
import { formsStore } from "@/lib/forms";
import { requireOrgMember } from "@/lib/session";

export const dynamic = "force-dynamic";

type Context =
  RouteContext<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/submissions/[submissionId]/files/[fileId]">;

/** A submitter's uploaded file: always a download, never rendered (it is untrusted). */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const { orgSlug, projectSlug, envSlug, formId, submissionId, fileId } = await context.params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ form: ["read"] })) return new Response("Not found", { status: 404 });
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) return new Response("Not found", { status: 404 });
  try {
    const file = await readFormSubmissionFile(
      {
        organizationId: organization.id,
        environmentId: found.environment.id,
        formId,
        submissionId,
        fileId,
      },
      formsStore(),
    );
    return new Response(Buffer.from(file.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.filename.replace(/[^\w.() -]/g, "_")}"`,
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FormError) return new Response(error.message, { status: 404 });
    throw error;
  }
}
