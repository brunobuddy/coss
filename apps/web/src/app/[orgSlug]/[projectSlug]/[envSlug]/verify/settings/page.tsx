import { listSmsNumbersWithSendability } from "@coss/sms";
import { getVerifySettings } from "@coss/verify";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { verifyPageContext } from "../page-context";
import { VerifySettingsForm } from "../verify-forms";

export const metadata: Metadata = { title: "Verify settings" };

export default async function VerifySettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/verify/settings">) {
  const { can, organization, project, environment, target } = await verifyPageContext(await params);
  if (!can({ verify: ["update"] })) notFound();
  const [settings, numbers] = await Promise.all([
    getVerifySettings({ organizationId: organization.id, environmentId: environment.id }),
    listSmsNumbersWithSendability(organization.id),
  ]);
  if (!settings) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Where this environment's one-time codes come from, where SMS codes may go, and how long they work."
        title="Verify settings"
      />
      <Panel
        description={
          <>
            Your backend starts a verification with{" "}
            <code className="font-mono">coss.verify.start()</code> and checks the code the user
            typed with <code className="font-mono">coss.verify.check()</code>.
          </>
        }
        title="Codes"
      >
        <PanelBody>
          <VerifySettingsForm
            {...target}
            numbers={numbers.filter((row) => row.canSend).map((row) => row.number.phoneNumber)}
            projectName={project.name}
            sandbox={environment.mode === "sandbox"}
            settings={{
              appName: settings.appNameIsDefault ? null : settings.appName,
              codeLength: settings.codeLength,
              ttlSeconds: settings.ttlSeconds,
              maxAttempts: settings.maxAttempts,
              smsFrom: settings.smsFrom,
              emailFrom: settings.emailFrom,
              allowedCountries: settings.allowedCountries,
            }}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
