import { getSignSettings } from "@coss/sign";
import { DEFAULT_SIGN_DISCLOSURE } from "@coss/sign/schemas";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { signPageContext } from "../page-context";
import { SignSettingsForm } from "../sign-actions";

export const metadata: Metadata = { title: "Sign settings" };

export default async function SignSettingsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sign/settings">) {
  const { can, organization, environment, target } = await signPageContext(await params);
  if (!can({ sign: ["update"] })) notFound();
  const settings = await getSignSettings({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="How the signing page looks, who may embed it, what signers agree to, and how signing emails are sent."
        title="Sign settings"
      />
      <Panel
        description={
          <>
            Your backend creates a signing session (
            <code className="font-mono">coss.sign.sessions.create</code>) and embeds its URL with{" "}
            <code className="font-mono">mountSigning</code> from{" "}
            <code className="font-mono">coss/sign</code>. The signing page is served from its own
            domain and never sees your API key.
          </>
        }
        title="Signing page"
      >
        <PanelBody>
          <SignSettingsForm
            {...target}
            defaultDisclosure={DEFAULT_SIGN_DISCLOSURE.replaceAll(
              "{name}",
              settings.displayName ?? organization.name,
            )}
            sandbox={environment.mode === "sandbox"}
            settings={settings}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
