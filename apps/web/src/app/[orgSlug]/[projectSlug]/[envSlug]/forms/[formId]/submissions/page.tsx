import { redirect } from "next/navigation";

/** Submissions are listed on the form's page (the breadcrumb's "Submissions" leads there). */
export default async function FormSubmissionsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/submissions">) {
  const { orgSlug, projectSlug, envSlug, formId } = await params;
  redirect(`/${orgSlug}/${projectSlug}/${envSlug}/forms/${formId}`);
}
