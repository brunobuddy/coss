import type { ScimSettingsResponse } from "@coss/companion";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../components/badge";
import { SettingsRow, SettingsValue } from "../../../../../components/organization-settings";
import { Panel, PanelBody, Ruled } from "../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../components/screen";
import { Text } from "../../../../../components/text";
import { WebButton } from "../../../../../components/web-button";
import { formatDate, formatDateTime, plural, roleLabel } from "../../../../../lib/format";
import { useOrganization } from "../../../../../lib/queries";
import { useScimSettings } from "../../../../../lib/queries-organization-settings";
import { scimDirectoryStatus } from "../../../../../lib/status-organization-settings";
import { openOnWeb } from "../../../../../lib/web";

// Copy from the dashboard's directory sync tab (apps/web/src/app/[orgSlug]/settings/scim/page.tsx
// and scim-forms.tsx). Read-only: connecting, tokens, group roles and disconnecting stay on
// coss.com. "Last sync" (the latest use of a token) is the app's summary of the token rows.

type Scim = ScimSettingsResponse;

function directoryDescription(directory: NonNullable<Scim["directory"]>): string {
  return `Connected ${formatDate(directory.connected_at)} · ${plural(directory.active_users, "active user")}, ${directory.inactive_users} deactivated · ${plural(directory.groups, "group")}.`;
}

function DirectoryPanel({ scim, org }: { scim: Scim; org: string }) {
  const organization = useOrganization(org);
  const { directory } = scim;
  const needsPlan = !directory && !scim.plan_allows;
  const needsSso = !directory && !scim.sso_active;
  const status = directory ? scimDirectoryStatus(directory.status) : null;
  return (
    <Panel
      action={
        status ? (
          <Badge variant="outline">
            <StatusDot label={status[1]} tone={status[0]} />
          </Badge>
        ) : null
      }
      description={
        directory
          ? directoryDescription(directory)
          : "Let your identity provider (Okta, Microsoft Entra ID, JumpCloud…) add, update and remove members over SCIM 2.0. Active users become members, or admins through the group roles below; deactivating or deleting one removes them and ends their SSO sessions here. Owners are never changed."
      }
      footer={
        !directory && !scim.can_update
          ? "Only owners and admins can connect a directory."
          : undefined
      }
      title="Directory"
    >
      {directory ? (
        <Ruled>
          <SettingsRow
            description="When your identity provider last used one of its tokens."
            label="Last sync"
            value={
              <Text muted variant="mono">
                {directory.last_sync_at ? formatDateTime(directory.last_sync_at) : "Never"}
              </Text>
            }
          />
        </Ruled>
      ) : needsPlan || needsSso ? (
        <PanelBody gap={10}>
          {needsPlan ? (
            <View style={styles.note}>
              <Text variant="small">Directory sync is part of the Enterprise plan.</Text>
            </View>
          ) : null}
          {needsSso ? (
            <View style={styles.note}>
              <Text variant="small">
                Set up single sign-on first: people your directory provisions sign in through it,
                and only addresses on its domains can be provisioned.
              </Text>
              <Text
                onPress={() =>
                  organization.data?.can.read_sso
                    ? router.push({ pathname: "/[org]/settings/sso", params: { org } })
                    : openOnWeb(`/${org}/settings/sso`)
                }
                style={styles.link}
                variant="smallMedium"
              >
                Configure SSO
              </Text>
            </View>
          ) : null}
        </PanelBody>
      ) : null}
    </Panel>
  );
}

export default function DirectorySyncScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useScimSettings(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const scim = query.data;
  const { directory } = scim;
  const owners = directory?.deactivated_owners ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Directory sync">
      {/* Without the plan, coss.com's page is an upgrade prompt: no purchase links here (3.1.1). */}
      {directory || scim.plan_allows ? <WebButton path={`/${org}/settings/scim`} /> : null}
      <PageIntro title="Directory sync" />
      {directory?.status === "decommissioning" ? (
        <Alert
          description="The directory's tokens no longer work, but some of its users are still being released. Continue disconnecting to finish."
          title="Disconnecting"
          tone="warning"
        />
      ) : null}
      {owners.length > 0 ? (
        <Alert
          description={`Directory sync never changes owners, so ${owners.join(", ")} ${owners.length === 1 ? "is" : "are"} still ${owners.length === 1 ? "an owner" : "owners"}. Remove or demote them on the Members page if they should no longer have access.`}
          title="Owners deactivated in your directory"
          tone="warning"
        />
      ) : null}
      <DirectoryPanel org={org} scim={scim} />

      {scim.base_url ? (
        <Panel
          description="Users are matched by their primary email address (or userName when they have no email)."
          title="Values for your identity provider"
        >
          <SettingsRow
            description="In your identity provider's SCIM provisioning settings, use this base URL and a bearer token from below."
            label="SCIM base URL"
            stacked={<SettingsValue>{scim.base_url}</SettingsValue>}
          />
        </Panel>
      ) : null}

      {directory && scim.can_update ? (
        <Panel
          description="Up to two tokens work at a time, so you can replace one without a gap: create a new token, update your identity provider, then revoke the old one."
          title="Tokens"
        >
          {scim.tokens.length === 0 ? (
            <PanelBody>
              <Text muted variant="small">
                No working token. Create one to resume syncing.
              </Text>
            </PanelBody>
          ) : (
            <Ruled>
              {scim.tokens.map((token) => (
                <SettingsRow
                  description={`${token.status === "expired" ? "Expired" : "Expires"} ${formatDate(token.expires_at)} · ${
                    token.last_used_at
                      ? `last used ${formatDateTime(token.last_used_at)}`
                      : "never used"
                  }`}
                  key={token.created_at}
                  label={`Created ${formatDate(token.created_at)}`}
                  value={
                    token.status === "expired" ? (
                      <Badge variant="outline">
                        <StatusDot label="Expired" tone="warning" />
                      </Badge>
                    ) : null
                  }
                />
              ))}
            </Ruled>
          )}
        </Panel>
      ) : null}

      <Panel
        description="Members of a directory group mapped to admin become admins; everyone else is a member. Group names are matched without regard to case. Saving applies the mappings to every directory user at once."
        title="Group roles"
      >
        {scim.group_roles.length === 0 ? (
          <PanelBody>
            <Text muted variant="small">
              No mappings: everyone the directory provisions is a member.
            </Text>
          </PanelBody>
        ) : (
          <Ruled>
            {scim.group_roles.map((mapping) => (
              <SettingsRow
                key={mapping.group}
                label={mapping.group}
                value={<Badge variant="outline">{roleLabel(mapping.role)}</Badge>}
              />
            ))}
          </Ruled>
        )}
      </Panel>

      {directory && scim.events.length > 0 ? (
        <Panel title="Recent activity">
          <Ruled>
            {scim.events.map((event) => (
              <View key={event.id} style={styles.event}>
                <Text variant="small">
                  {event.label}
                  <Text muted variant="small">
                    {" "}
                    · {event.actor}
                  </Text>
                </Text>
                <Text muted variant="mono">
                  {formatDateTime(event.created_at)}
                </Text>
              </View>
            ))}
          </Ruled>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4 },
  link: { textDecorationLine: "underline" },
  event: { gap: 2, paddingHorizontal: 16, paddingVertical: 12 },
});
