import { db } from "@coss/db";
import { listAudiences, listTopics } from "@coss/email";
import { contactsOf, filesOf } from "@coss/forms";
import { resolveRiskSettings } from "@coss/risk";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { DeleteFormButton, FormSettingsForm } from "../../form-actions";
import { formPageContext } from "../../page-context";

export const metadata: Metadata = { title: "Form settings" };

/**
 * Every audience: one missing from the checkboxes would be dropped from the form's contacts by
 * the next save.
 */
async function allAudiences(scope: { organizationId: string; environmentId: string }) {
  const data: Awaited<ReturnType<typeof listAudiences>>["data"] = [];
  let after: string | undefined;
  for (;;) {
    const page = await listAudiences(scope, { limit: 100, after });
    data.push(...page.data);
    const last = page.data.at(-1);
    if (!page.has_more || !last) return { data };
    after = last.id;
  }
}

export default async function FormSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/forms/[formId]/settings">) {
  const { organization, environment, form, can, target } = await formPageContext(await params);
  if (!can({ form: ["update"] })) notFound();
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const [audiences, topics, risk] = await Promise.all([
    allAudiences(scope),
    // At most MAX_TOPICS (100) per environment: one page.
    listTopics(scope, { limit: 100 }),
    resolveRiskSettings(db, scope),
  ]);
  const contacts = contactsOf(form);
  const files = filesOf(form);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          can({ form: ["delete"] }) ? (
            <DeleteFormButton {...target} formId={form.id} name={form.name} />
          ) : null
        }
        description="Who may post, how spam is caught, and where accepted submissions go."
        title={`${form.name} settings`}
      />
      <Panel>
        <PanelBody>
          <FormSettingsForm
            {...target}
            // A save re-renders with the saved values: start the form over from them.
            key={form.updatedAt.toISOString()}
            audiences={audiences.data.map((audience) => ({ id: audience.id, name: audience.name }))}
            captchaConfigured={risk.captcha !== null}
            fieldNames={(form.fields ?? []).map((field) => field.name)}
            formId={form.id}
            sandbox={environment.mode === "sandbox"}
            topics={topics.data.map((topic) => ({ key: topic.key, name: topic.name }))}
            values={{
              name: form.name,
              enabled: form.enabled,
              strictFields: form.strictFields,
              allowedOrigins: form.allowedOrigins,
              redirectUrl: form.redirectUrl,
              honeypotField: form.honeypotField,
              captcha: form.captcha,
              captchaSiteKey: form.captchaSiteKey,
              contentThreshold: form.contentThreshold,
              onReview: form.onReview,
              emailField: form.emailField,
              verify: form.verifySubmitter,
              confirmationFrom: form.confirmationFrom,
              recipients: form.notifyRecipients,
              notificationFrom: form.notificationFrom,
              contacts: {
                enabled: contacts.enabled,
                audienceIds: contacts.audienceIds,
                topics: contacts.topics,
                doubleOptIn: contacts.doubleOptIn,
                firstNameField: contacts.firstNameField,
                lastNameField: contacts.lastNameField,
              },
              files,
            }}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
