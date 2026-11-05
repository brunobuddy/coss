import { API_KEY_PREFIX } from "@coss/auth/constants";
import { environmentHref } from "@coss/dashboard-routes";
import { inboundAddressFor, listDomains } from "@coss/email";
import { getEnvironment, listEnvironmentApiKeys } from "@coss/tenancy";
import { listWebhookEndpoints } from "@coss/webhooks";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { CopyValue } from "@/components/copy-value";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { env } from "@/env";
import { emailRuntime } from "@/lib/email-runtime";
import { quickStart } from "@/lib/quick-start";
import { requireOrgMember } from "@/lib/session";

export const metadata: Metadata = { title: "Developers" };

/** What an environment's code needs: its keys and IDs, a first request, the CLI and MCP server. */
export default async function DevelopersPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { environment } = found;
  const live = environment.mode === "live";
  const scope = { organizationId: organization.id, environmentId: environment.id };
  const inbound = emailRuntime().inbound;
  const [keys, endpoints, domains, inboundAddress] = await Promise.all([
    listEnvironmentApiKeys(scope),
    can({ webhook: ["read"] }) ? listWebhookEndpoints(scope) : null,
    live ? listDomains({ organizationId: organization.id }) : null,
    inbound && can({ email: ["read"] }) ? inboundAddressFor(scope, inbound.managedDomain) : null,
  ]);
  const base = environmentHref({
    organization: orgSlug,
    project: projectSlug,
    environment: envSlug,
  });
  const sendingDomain = domains ? domains.find((domain) => domain.canSend)?.name : "example.com";
  const apiUrl = env.API_PUBLIC_URL;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="One API key and one SDK reach every product. Keys, webhooks and logs here belong to this environment."
        title="Developers"
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title="Environment">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Mode">{live ? "Live" : "Sandbox"}</SpecItem>
              <SpecItem label="Key prefix" mono>
                {API_KEY_PREFIX[environment.mode]}
              </SpecItem>
              <SpecItem label="API keys" mono>
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`${base}/developers/api-keys`}
                >
                  {keys.length}
                </Link>
              </SpecItem>
              {endpoints ? (
                <SpecItem label="Webhook endpoints" mono>
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`${base}/developers/webhooks`}
                  >
                    {endpoints.length}
                  </Link>
                </SpecItem>
              ) : null}
              {inboundAddress ? (
                <SpecItem label="Inbound address" mono>
                  <CopyValue value={`support@${inboundAddress.domain}`} />
                </SpecItem>
              ) : null}
              <SpecItem label="API URL" mono>
                <CopyValue value={apiUrl} />
              </SpecItem>
              <SpecItem label="Environment ID" mono>
                <span className="truncate">{environment.id}</span>
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>

        <Panel
          description="Get a key into your project, or give your coding agent the docs and your account."
          title="Tools"
        >
          <PanelBody flush>
            <SpecList>
              <SpecItem label="SDK" mono>
                <CopyValue value="npm install coss" />
              </SpecItem>
              <SpecItem label="CLI" mono>
                <CopyValue value="npx coss-cli init" />
              </SpecItem>
              <SpecItem label="MCP server" mono>
                <CopyValue value="npx -y coss-mcp" />
              </SpecItem>
              <SpecItem label="Docs for agents" mono>
                <a className="underline-offset-4 hover:underline" href="/llms.txt">
                  /llms.txt
                </a>
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>
      </div>

      <Panel
        action={<CopyButton label="Copy API URL" value={apiUrl} />}
        description={
          <>
            A first request: send an email with the public API. Set{" "}
            <code className="font-mono">COSS_API_KEY</code> to a key from this environment.
          </>
        }
        id="quick-start"
        title="Quick start"
      >
        <PanelBody className="overflow-hidden" flush>
          <CodeBlock
            className="rounded-none border-0 bg-transparent"
            samples={quickStart(
              apiUrl,
              `onboarding@${sendingDomain ?? "your-verified-domain.com"}`,
            )}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
