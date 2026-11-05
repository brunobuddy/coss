import { filesOf, formEndpoint, hostedFormPage, hostedOf } from "@coss/forms";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyValue } from "@/components/copy-value";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { PREVIEW_HEAD } from "@/lib/email-preview";
import { formsUrl } from "@/lib/forms";
import { FormBuilder } from "../../form-actions";
import { formPageContext } from "../../page-context";

export const metadata: Metadata = { title: "Form fields" };

export default async function FormBuilderPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/builder">) {
  const { form, can, target } = await formPageContext(await params);
  if (!can({ form: ["update"] })) notFound();
  const hosted = hostedOf(form);
  const url = formsUrl();
  // The page as saved, without its captcha widget: rendered in a sandboxed frame (no scripts,
  // no network, no posting).
  const preview =
    form.fields && form.fields.length > 0
      ? hostedFormPage({ hosted: { form, captcha: null }, action: "#", nonce: "preview" })
          .replace("<head>", `<head>${PREVIEW_HEAD}`)
          .replace('<style nonce="preview">', "<style>")
      : null;
  return (
    <div className="flex flex-col gap-6" data-page-width="full">
      <PageHeader
        description="The fields submissions are checked against, and the page coss.com can host for them."
        meta={
          hosted.enabled && form.hostedPublishedAt && url ? (
            <CopyValue value={formEndpoint({ publicUrl: url }, form.id)} />
          ) : null
        }
        title={`${form.name} fields`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelBody>
            <FormBuilder
              {...target}
              // A save re-renders with the saved values: start the editor over from them.
              key={form.updatedAt.toISOString()}
              fields={(form.fields ?? []).map((field) => ({
                key: field.name,
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                required: field.required,
                placeholder: field.placeholder ?? "",
                options: field.options.join("\n"),
                savedOptions: field.options,
                maxLength: field.maxLength,
              }))}
              filesEnabled={filesOf(form).enabled}
              formId={form.id}
              hosted={hosted}
            />
          </PanelBody>
        </Panel>
        <Panel description="As saved. Save the fields to refresh it." title="Preview">
          <PanelBody flush>
            {preview ? (
              <iframe
                className="h-[42rem] w-full rounded-b-xl bg-white"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={preview}
                title="Hosted page preview"
              />
            ) : (
              <p className="p-5 text-muted-foreground text-sm">Add fields to see the page.</p>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
