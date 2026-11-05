import {
  GOOGLE_SCOPES,
  listOauthApps,
  MICROSOFT_SCOPES,
  oauthRedirectUri,
  ZOOM_APP_SCOPES,
} from "@coss/scheduling";
import type { OauthAppObjectOutput } from "@coss/scheduling/schemas";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { KeyRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyValue } from "@/components/copy-value";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { planHas } from "@/lib/billing";
import { schedulingCalendarDeps } from "@/lib/scheduling";
import { schedulingPageContext } from "../page-context";
import { DeleteOauthAppButton, EditOauthAppDialog, NewOauthAppDialog } from "./oauth-app-actions";

export const metadata: Metadata = { title: "OAuth apps" };

const PROVIDERS = [
  { key: "google", name: "Google", scopes: GOOGLE_SCOPES },
  { key: "microsoft", name: "Microsoft", scopes: MICROSOFT_SCOPES },
  { key: "zoom", name: "Zoom", scopes: ZOOM_APP_SCOPES },
] as const;

function statusOf(app: OauthAppObjectOutput): { tone: StatusTone; label: string } {
  if (app.status === "failing") return { tone: "error", label: "Refused by the provider" };
  return app.verified_at
    ? { tone: "success", label: "Active" }
    : { tone: "warning", label: "Waiting for a first consent" };
}

export default async function OauthAppsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/oauth-apps">) {
  const { organization, scope, can, target } = await schedulingPageContext(await params);
  const deps = schedulingCalendarDeps();
  const [apps, planAllows] = await Promise.all([
    listOauthApps(scope, deps),
    planHas(organization.id, "schedulingOauthApps"),
  ]);
  const canUpdate = can({ scheduling: ["update"] });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Use your own Google, Microsoft or Zoom app, so the consent screen hosts see shows your brand instead of coss.com's."
        title="OAuth apps"
      />
      {!planAllows && apps.length === 0 ? (
        <Panel>
          <PanelBody flush>
            <EmptyState
              action={
                <Button
                  render={<Link href={`/${organization.slug}/settings/billing/plans`} />}
                  size="sm"
                  variant="outline"
                >
                  Compare plans
                </Button>
              }
              compact
              description="Bring-your-own OAuth apps are part of the Scale plan and above."
              icon={KeyRoundIcon}
              title="Upgrade to use your own OAuth apps"
            />
          </PanelBody>
        </Panel>
      ) : (
        PROVIDERS.map(({ key, name, scopes }) => {
          const app = apps.find((candidate) => candidate.provider === key);
          const status = app ? statusOf(app) : null;
          return (
            <Panel key={key}>
              <PanelBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground text-sm">
                      {status ? (
                        <StatusDot tone={status.tone}>{status.label}</StatusDot>
                      ) : (
                        "Using coss.com's app"
                      )}
                    </span>
                  </div>
                  {canUpdate && app ? (
                    <div className="flex gap-1">
                      <EditOauthAppDialog
                        {...target}
                        completionUrl={app.completion_url}
                        name={name}
                        oauthAppId={app.id}
                        provider={key}
                        redirectUri={app.redirect_uri}
                        secretExpiresAt={app.secret_expires_at}
                        tenantId={app.tenant_id}
                      />
                      <DeleteOauthAppButton
                        {...target}
                        connections={app.connections}
                        name={name}
                        oauthAppId={app.id}
                      />
                    </div>
                  ) : null}
                  {canUpdate && !app && planAllows ? (
                    <NewOauthAppDialog {...target} name={name} provider={key} />
                  ) : null}
                </div>
              </PanelBody>
              {app?.status === "failing" ? (
                <PanelBody>
                  <Alert variant="error">
                    <AlertTitle>Calendars connected through this app can't be read</AlertTitle>
                    <AlertDescription>
                      {name} refused its client ID and secret
                      {app.last_error_code ? ` (${app.last_error_code})` : ""}. Hosts stop being
                      offered once what's known of their calendars is out of date, and new
                      connections are refused. Update the client secret, and nobody has to
                      reconnect.
                    </AlertDescription>
                  </Alert>
                </PanelBody>
              ) : null}
              <PanelBody flush>
                <SpecList columns={2}>
                  {app ? (
                    <>
                      <SpecItem label="Client ID">
                        <CopyValue value={app.client_id} />
                      </SpecItem>
                      <SpecItem label="Connections">{app.connections}</SpecItem>
                      {app.tenant_id ? (
                        <SpecItem label="Tenant ID">
                          <CopyValue value={app.tenant_id} />
                        </SpecItem>
                      ) : null}
                      {app.secret_expires_at ? (
                        <SpecItem label="Secret expires">
                          {app.secret_expires_at.slice(0, 10)}
                        </SpecItem>
                      ) : null}
                      {app.redirect_uri ? (
                        <SpecItem label="Your forwarding page">
                          <CopyValue value={app.redirect_uri} />
                        </SpecItem>
                      ) : null}
                      {app.completion_url ? (
                        <SpecItem label="After consent">
                          <CopyValue value={app.completion_url} />
                        </SpecItem>
                      ) : null}
                      {app.zoom_event_url ? (
                        <SpecItem label="Event notification URL" stacked>
                          <CopyValue value={app.zoom_event_url} />
                        </SpecItem>
                      ) : null}
                    </>
                  ) : null}
                  <SpecItem
                    label={app?.redirect_uri ? "Forward code and state to" : "Redirect URI"}
                    stacked
                  >
                    <CopyValue value={oauthRedirectUri(deps, key)} />
                  </SpecItem>
                  <SpecItem label="Scopes" stacked>
                    <CopyValue
                      className="[&_code]:whitespace-pre-wrap"
                      display={scopes.join("\n")}
                      value={scopes.join(" ")}
                    />
                  </SpecItem>
                </SpecList>
              </PanelBody>
            </Panel>
          );
        })
      )}
    </div>
  );
}
