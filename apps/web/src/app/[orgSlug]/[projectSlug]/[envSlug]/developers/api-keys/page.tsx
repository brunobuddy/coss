import { API_KEY_PREFIX } from "@coss/auth/constants";
import { listBudgetHolds } from "@coss/billing";
import {
  type EnvironmentApiKeySummary,
  getEnvironment,
  keyCreationAllowed,
  listEnvironmentApiKeys,
  listOrganizationMembers,
} from "@coss/tenancy";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { KeyRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime, formatRelative } from "@/lib/format";
import { liveKeyRestriction } from "@/lib/live-keys";
import { requireOrgMember } from "@/lib/session";
import { apiKeyPaused } from "@/lib/spend";
import { ApiKeyAccessBadge } from "./api-key-access";
import {
  CreateApiKeyDialog,
  CreateApiKeyUnavailable,
  type OwnerOption,
} from "./create-api-key-dialog";
import { PersonalKeysSwitch } from "./personal-keys-switch";
import { RevokeApiKeyButton } from "./revoke-api-key-button";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/developers/api-keys">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { session, organization, member, can } = await requireOrgMember(orgSlug);
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;

  const live = environment.mode === "live";
  const userId = session.user.id;
  const canManage = can({ apiKey: ["manage"] });
  const [keys, createRestriction, members, holds] = await Promise.all([
    listEnvironmentApiKeys({ organizationId: organization.id, environmentId: environment.id }),
    live ? liveKeyRestriction(session, organization.id) : null,
    canManage ? listOrganizationMembers({ organizationId: organization.id }) : [],
    live ? listBudgetHolds(organization.id) : [],
  ]);
  const pausedKey = (key: EnvironmentApiKeySummary) => apiKeyPaused(holds, key, project.id);
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  // Members create personal keys where the environment allows them; owners and admins any key.
  const canCreate =
    can({ apiKey: ["create"] }) &&
    keyCreationAllowed({
      role: member.role,
      environment,
      ownerUserId: userId,
      creatorUserId: userId,
    });
  const canRevoke = (key: EnvironmentApiKeySummary) =>
    can({ apiKey: ["delete"] }) || (can({ apiKey: ["create"] }) && key.owner?.id === userId);
  const anyRevocable = keys.some(canRevoke);
  const owners: OwnerOption[] | null = canManage
    ? [
        { value: "me", label: "Me (personal key)" },
        { value: "organization", label: "Organization" },
        ...members
          .filter((m) => m.user.id !== userId)
          .map((m) => ({
            value: m.user.id,
            label: `${m.user.name || m.user.email} (personal key)`,
          })),
      ]
    : null;
  const prefix = API_KEY_PREFIX[environment.mode];
  const createDialog =
    canCreate && !createRestriction ? (
      <CreateApiKeyDialog environmentName={environment.name} owners={owners} {...target} />
    ) : null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={createDialog}
        description={
          <>
            Keys authenticate requests to the API and SDK, and are the password for SMTP. They start
            with <code className="font-mono text-foreground">{prefix}</code> and only work in{" "}
            {project.name} · {environment.name}.
          </>
        }
        meta={<ModeBadge mode={environment.mode} />}
        title="API keys"
      />
      {canCreate && createRestriction ? (
        <CreateApiKeyUnavailable reason={createRestriction} />
      ) : null}
      <PersonalKeysSwitch
        disabled={!can({ environment: ["update"] })}
        enabled={environment.personalKeys}
        live={live}
        {...target}
      />
      <Panel>
        {keys.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              action={createDialog}
              compact
              description={`Create a key, then send with it from your server as COSS_API_KEY.`}
              icon={KeyRoundIcon}
              title="No API keys yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                {anyRevocable ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {key.name ?? "Untitled"}
                      {pausedKey(key) ? (
                        <Badge title="Its monthly budget is used up" variant="error">
                          Paused
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {key.start ? `${key.start}…` : "—"}
                  </TableCell>
                  <TableCell>
                    <KeyOwner owner={key.owner} userId={userId} />
                  </TableCell>
                  <TableCell>
                    <ApiKeyAccessBadge access={key.access} permissions={key.permissions} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(key.createdAt)}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={key.lastRequest ? formatDateTime(key.lastRequest) : undefined}
                  >
                    {key.lastRequest ? formatRelative(key.lastRequest, now) : "Never"}
                  </TableCell>
                  {anyRevocable ? (
                    <TableCell className="text-right">
                      {canRevoke(key) ? (
                        <RevokeApiKeyButton
                          keyId={key.id}
                          keyName={key.name ?? "Untitled"}
                          {...target}
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

/** Who a key belongs to: the organization, or the member it is assigned to (their spend). */
function KeyOwner(props: { owner: EnvironmentApiKeySummary["owner"]; userId: string }) {
  if (!props.owner) return <span className="text-muted-foreground">Organization</span>;
  const name = props.owner.id === props.userId ? "You" : props.owner.name || props.owner.email;
  return (
    <span className="flex items-center gap-2">
      <span title={props.owner.email}>{name}</span>
      {props.owner.role === null ? (
        // Keys of former members stop working; they are revoked when the member leaves.
        <Badge variant="warning">Left</Badge>
      ) : null}
    </span>
  );
}
