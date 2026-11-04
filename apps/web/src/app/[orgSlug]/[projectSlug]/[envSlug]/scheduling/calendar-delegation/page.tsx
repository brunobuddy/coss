import { listCalendarDelegations } from "@coss/scheduling";
import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { CalendarCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { CopyValue } from "@/components/copy-value";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { schedulingPageContext } from "../page-context";
import {
  DeleteDelegationButton,
  EditDelegationDialog,
  NewDelegationDialog,
  VerifyDelegationForm,
} from "./delegation-actions";

export const metadata: Metadata = { title: "Calendar delegation" };

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: "warning", label: "Waiting to be verified" },
  active: { tone: "success", label: "Active" },
  failing: { tone: "error", label: "Access refused" },
  deleting: { tone: "neutral", label: "Being removed" },
};

const PROVIDER = { google: "Google Workspace", microsoft: "Microsoft 365" };

export default async function CalendarDelegationPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/scheduling/calendar-delegation">) {
  const { scope, can, target } = await schedulingPageContext(await params);
  const delegations = await listCalendarDelegations(scope);
  const canUpdate = can({ scheduling: ["update"] });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={canUpdate ? <NewDelegationDialog {...target} /> : null}
        description="Authorize a whole domain once, and every host on it gets their calendar with no consent screen."
        title="Calendar delegation"
      />
      {delegations.length === 0 ? (
        <Panel>
          <PanelBody>
            <EmptyState
              action={canUpdate ? <NewDelegationDialog {...target} /> : null}
              description="Hosts connect their own calendars until you add one. It uses your own Google service account or Microsoft Entra app."
              icon={CalendarCheckIcon}
              title="No delegations yet"
            />
          </PanelBody>
        </Panel>
      ) : (
        delegations.map((delegation) => {
          const status = STATUS[delegation.status] ?? {
            tone: "neutral" as const,
            label: delegation.status,
          };
          return (
            <Panel key={delegation.id}>
              <PanelBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="break-all font-medium">{delegation.domain}</span>
                    <span className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
                      {PROVIDER[delegation.provider]}
                      <StatusDot tone={status.tone}>{status.label}</StatusDot>
                    </span>
                  </div>
                  {canUpdate && delegation.status !== "deleting" ? (
                    <div className="flex gap-1">
                      <EditDelegationDialog
                        {...target}
                        delegationId={delegation.id}
                        domain={delegation.domain}
                        matchHostEmail={delegation.match_host_email}
                        provider={delegation.provider}
                        secretExpiresAt={delegation.secret_expires_at}
                      />
                      <DeleteDelegationButton
                        {...target}
                        delegationId={delegation.id}
                        domain={delegation.domain}
                        hosts={delegation.hosts_connected + delegation.hosts_failed}
                      />
                    </div>
                  ) : null}
                </div>
              </PanelBody>
              {delegation.status === "failing" ? (
                <PanelBody>
                  <Alert variant="error">
                    <AlertTitle>Hosts on this domain aren't being offered</AlertTitle>
                    <AlertDescription>
                      {PROVIDER[delegation.provider]} refused access
                      {delegation.last_error_code ? ` (${delegation.last_error_code})` : ""}. They
                      come back by themselves once it's restored, and nobody has to reconnect.
                    </AlertDescription>
                  </Alert>
                </PanelBody>
              ) : null}
              {delegation.status === "pending" ? (
                <PanelBody>
                  <div className="flex flex-col gap-4">
                    {delegation.provider === "google" ? (
                      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                        <li>
                          In the Google Admin console, open Security, API controls, Manage Domain
                          Wide Delegation, and add a new client.
                        </li>
                        <li>
                          Use this client ID and these scopes. It can take up to 24 hours to apply.
                        </li>
                        <li>Enter a real mailbox on {delegation.domain} below to try it.</li>
                      </ol>
                    ) : (
                      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                        <li>
                          In Entra, give this app the Microsoft Graph application permission below,
                          and grant admin consent.
                        </li>
                        <li>Enter a real mailbox on {delegation.domain} below to try it.</li>
                      </ol>
                    )}
                    {canUpdate ? (
                      <VerifyDelegationForm
                        {...target}
                        delegationId={delegation.id}
                        domain={delegation.domain}
                      />
                    ) : null}
                  </div>
                </PanelBody>
              ) : null}
              <PanelBody flush>
                <SpecList columns={2}>
                  <SpecItem label="Hosts connected">{delegation.hosts_connected}</SpecItem>
                  <SpecItem label="Hosts with a problem">{delegation.hosts_failed}</SpecItem>
                  <SpecItem label="Matches host emails">
                    {delegation.match_host_email ? "Yes" : "No: calendar_account only"}
                  </SpecItem>
                  <SpecItem label="Verified with" mono>
                    {delegation.verified_account ?? "—"}
                  </SpecItem>
                  <SpecItem label="Client ID">
                    <CopyValue value={delegation.client_id} />
                  </SpecItem>
                  {delegation.tenant_id ? (
                    <SpecItem label="Tenant ID">
                      <CopyValue value={delegation.tenant_id} />
                    </SpecItem>
                  ) : null}
                  {delegation.secret_expires_at ? (
                    <SpecItem label="Secret expires">
                      {delegation.secret_expires_at.slice(0, 10)}
                    </SpecItem>
                  ) : null}
                  <SpecItem
                    label={delegation.provider === "google" ? "Scopes" : "Permission"}
                    stacked
                  >
                    <CopyValue
                      className="[&_code]:whitespace-pre-wrap"
                      display={delegation.scopes.join("\n")}
                      value={delegation.scopes.join(",")}
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
