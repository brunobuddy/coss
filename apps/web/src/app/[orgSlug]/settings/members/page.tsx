import { assignableOrgRoles, canRemoveOrgMember } from "@coss/auth/permissions";
import {
  listOrganizationMembers,
  listPendingInvitations,
  listScimManagedUserIds,
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
import { MailIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { UserAvatar } from "@/components/user-avatar";
import { avatarUrl } from "@/lib/avatars";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireOrgMember } from "@/lib/session";
import { CancelInvitationButton } from "./cancel-invitation-button";
import { ChangeRoleDialog } from "./change-role-dialog";
import { InviteMemberForm } from "./invite-member-form";
import { RemoveMemberButton } from "./remove-member-button";
import { ResendInvitationButton } from "./resend-invitation-button";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/[orgSlug]/settings/members">) {
  const { orgSlug } = await params;
  const { organization, member, can } = await requireOrgMember(orgSlug);
  const [members, invitations, directoryUserIds] = await Promise.all([
    listOrganizationMembers({ organizationId: organization.id }),
    listPendingInvitations({ organizationId: organization.id }),
    listScimManagedUserIds({ organizationId: organization.id }),
  ]);
  const canInvite = can({ invitation: ["create"] });
  const canCancelInvitations = can({ invitation: ["cancel"] });
  const canChangeRoles = can({ member: ["update"] });
  const canRemoveMembers = can({ member: ["delete"] });
  const canManageMembers = canChangeRoles || canRemoveMembers;
  const canManageInvitations = canInvite || canCancelInvitations;

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description={`People with access to ${organization.name}. Admins manage projects, domains and API keys; members can read everything but secrets.`}
        meta={
          <span className="font-mono text-xs">
            {members.length} {members.length === 1 ? "member" : "members"}
            {invitations.length > 0 ? ` · ${invitations.length} invited` : ""}
          </span>
        }
        title="Members"
      />

      {canInvite ? (
        <Panel
          description="They get an email with a link to join. Admins can manage projects and API keys; members have read-only access and their own personal API keys where you allow them."
          title="Invite a member"
        >
          <PanelBody>
            <InviteMemberForm orgSlug={organization.slug} />
          </PanelBody>
        </Panel>
      ) : null}

      <Panel title="Members">
        <Table variant="card">
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Two-factor</TableHead>
              <TableHead>Joined</TableHead>
              {canManageMembers ? <TableHead className="w-0" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((row) => {
              const isOwnerRow = row.role.split(",").includes("owner");
              // The directory (SCIM) manages its users' membership and role, except owners'.
              const fromDirectory = directoryUserIds.has(row.user.id) && !isOwnerRow;
              const roles = assignableOrgRoles(member.role, row.role).filter(
                (role) => !fromDirectory || role === "owner" || role === row.role,
              );
              const isSelf = row.id === member.id;
              // Leaving (removing yourself) lives on the settings page.
              const removable =
                !isSelf && !fromDirectory && canRemoveOrgMember(member.role, row.role);
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        className="size-8 border"
                        fallbackClassName="text-[0.6875rem]"
                        user={{ ...row.user, image: avatarUrl(row.user) }}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {row.user.name}
                          {isSelf ? (
                            <span className="font-normal text-muted-foreground"> (you)</span>
                          ) : null}
                        </span>
                        <span className="truncate text-muted-foreground text-xs">
                          {row.user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge className="capitalize" variant="outline">
                        {row.role}
                      </Badge>
                      {fromDirectory ? <Badge variant="info">directory</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.user.twoFactorEnabled ? (
                      <StatusDot tone="success">On</StatusDot>
                    ) : (
                      <StatusDot tone={organization.requireTwoFactor ? "warning" : "neutral"}>
                        Off
                      </StatusDot>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDateTime(row.createdAt)}
                  >
                    {formatRelative(row.createdAt, now)}
                  </TableCell>
                  {canManageMembers ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {roles.some((role) => role !== row.role) ? (
                          <ChangeRoleDialog
                            currentRole={row.role}
                            isSelf={isSelf}
                            memberId={row.id}
                            memberName={row.user.name}
                            orgSlug={organization.slug}
                            roles={roles}
                          />
                        ) : null}
                        {removable ? (
                          <RemoveMemberButton
                            memberId={row.id}
                            memberName={row.user.name}
                            orgName={organization.name}
                            orgSlug={organization.slug}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Pending invitations">
        {invitations.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Invitations waiting to be accepted show up here."
              icon={MailIcon}
              title="No pending invitations"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Expires</TableHead>
                {canManageInvitations ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>
                    <Badge className="capitalize" variant="outline">
                      {invitation.role ?? "member"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDateTime(invitation.createdAt)}
                  >
                    {formatRelative(invitation.createdAt, now)}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDateTime(invitation.expiresAt)}
                  >
                    {formatRelative(invitation.expiresAt, now)}
                  </TableCell>
                  {canManageInvitations ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canInvite ? (
                          <ResendInvitationButton
                            email={invitation.email}
                            invitationId={invitation.id}
                            orgSlug={organization.slug}
                          />
                        ) : null}
                        {canCancelInvitations ? (
                          <CancelInvitationButton
                            email={invitation.email}
                            invitationId={invitation.id}
                            orgSlug={organization.slug}
                          />
                        ) : null}
                      </div>
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
