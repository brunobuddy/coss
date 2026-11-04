import type { OrganizationSettingsResponse } from "@coss/companion";
import { formatRetentionPeriod, RETENTION_POLICY } from "@coss/retention";
import { type Href, Stack, useLocalSearchParams } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  History,
  type LucideIcon,
  Shield,
  Users,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../components/badge";
import { Button } from "../../../../components/button";
import { Icon } from "../../../../components/icon";
import { SettingsRow } from "../../../../components/organization-settings";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../components/screen";
import { Text } from "../../../../components/text";
import { WebButton } from "../../../../components/web-button";
import { useOrganizationSettings } from "../../../../lib/queries-organization-settings";
import { openOnWeb } from "../../../../lib/web";

// Copy from the dashboard's organization settings (apps/web/src/app/[orgSlug]/settings/page.tsx,
// its layout's tabs and apps/web/src/components/retention-policy.tsx). Read-only: renaming,
// requirements, the API version upgrade, leaving and deleting stay on coss.com.

type Settings = OrganizationSettingsResponse;

/** The other settings tabs the member may open (`ORGANIZATION_SETTINGS_NAV`). */
function tabs(settings: Settings): { label: string; path: string; icon: LucideIcon }[] {
  return [
    settings.can.read_billing && { label: "Billing", path: "/billing", icon: CreditCard },
    settings.can.read_sso && { label: "Single sign-on", path: "/sso", icon: Shield },
    settings.can.read_scim && { label: "Directory sync", path: "/scim", icon: Users },
    settings.can.read_audit && { label: "Audit log", path: "/audit", icon: History },
  ].filter((item) => item !== false);
}

function twoFactorDescription(settings: Settings): string {
  const { two_factor: twoFactor } = settings;
  const lead =
    "Members who sign in with a password must use an authenticator app. Signing in through this organization's SSO counts instead.";
  if (!twoFactor.required && !twoFactor.you && settings.can_update) {
    return `${lead} Set it up for your own account before requiring it.`;
  }
  if (twoFactor.members_without > 0) {
    return `${lead} ${twoFactor.members_without} of ${twoFactor.members} member${twoFactor.members === 1 ? " doesn't" : "s don't"} have it yet.`;
  }
  return `${lead} Every member has it set up.`;
}

function RetentionPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      description="The same for every organization. Data is deleted automatically once its period ends."
      title="Data retention"
    >
      <Ruled>
        <SettingsRow
          description={`${RETENTION_POLICY.length} kinds of data, each with its own period.`}
          label="Retention periods"
          stacked={
            <View style={styles.buttons}>
              <Button
                icon={open ? ChevronUp : ChevronDown}
                onPress={() => setOpen(!open)}
                size="sm"
                title={open ? "Hide periods" : "Show periods"}
                variant="outline"
              />
              <Button
                onPress={() => openOnWeb("/docs/data-retention")}
                size="sm"
                title="Read the policy"
                variant="ghost"
              />
            </View>
          }
        />
        {open
          ? RETENTION_POLICY.map((rule) => (
              <View key={rule.id} style={styles.rule}>
                <View style={styles.ruleHead}>
                  <Text style={styles.flex} variant="smallMedium">
                    {rule.label}
                  </Text>
                  <Text muted variant="mono">
                    {formatRetentionPeriod(rule.period)}
                  </Text>
                </View>
                <Text muted variant="small">
                  {rule.description}
                </Text>
              </View>
            ))
          : null}
      </Ruled>
    </Panel>
  );
}

export default function OrganizationSettingsScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useOrganizationSettings(org);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const settings = query.data;
  const { organization, api_version: apiVersion } = settings;
  const latest = apiVersion.pinned === null || apiVersion.pinned === apiVersion.latest;
  const otherTabs = tabs(settings);
  return (
    <Screen onRefresh={() => query.refetch()} title="Settings">
      <Stack.Screen options={{ headerRight: () => <WebButton path={`/${org}/settings`} /> }} />
      <PageIntro title="Settings" />
      {otherTabs.length > 0 ? (
        <Panel>
          <Ruled>
            {otherTabs.map((tab) => (
              <ListRow
                href={`/${org}/settings${tab.path}` as Href}
                key={tab.path}
                leading={<Icon color="mutedForeground" icon={tab.icon} size={18} />}
                title={tab.label}
              />
            ))}
          </Ruled>
        </Panel>
      ) : null}

      <Panel
        footer={settings.can_update ? undefined : "Only owners and admins can change these."}
        title="General"
      >
        <Ruled>
          <SettingsRow
            description="Shown to members across the dashboard."
            label="Name"
            value={
              <Text selectable variant="small">
                {organization.name}
              </Text>
            }
          />
          <SettingsRow
            description="The first segment of every dashboard URL."
            label="URL"
            value={
              <Text selectable variant="mono">
                {organization.slug}
              </Text>
            }
          />
        </Ruled>
      </Panel>

      <Panel title="Security">
        <Ruled>
          {settings.hipaa_mode ? (
            <SettingsRow
              description={`Business Associate Agreement ${settings.hipaa_mode.baa_reference}. See what it does on coss.com under Settings, Compliance.`}
              label="HIPAA mode"
              value={<StatusDot label="Active" muted tone="success" />}
            />
          ) : null}
          <SettingsRow
            description={twoFactorDescription(settings)}
            label="Require two-factor authentication"
            value={
              <StatusDot
                label={settings.two_factor.required ? "Required" : "Not required"}
                muted
                tone={settings.two_factor.required ? "success" : "neutral"}
              />
            }
          />
          {settings.sso ? (
            <SettingsRow
              description="Let members sign in through your identity provider with OpenID Connect or SAML."
              href={`/${org}/settings/sso` as Href}
              label="Single sign-on"
              value={
                <StatusDot
                  label={settings.sso.required ? "Required" : "Optional"}
                  muted
                  tone={settings.sso.required ? "success" : "neutral"}
                />
              }
            />
          ) : null}
          {settings.scim ? (
            <SettingsRow
              description="Let your identity provider add and remove members over SCIM, and make admins from its groups."
              href={`/${org}/settings/scim` as Href}
              label="Directory sync"
              value={
                <StatusDot
                  label={settings.scim.connected ? "Connected" : "Not connected"}
                  muted
                  tone={settings.scim.connected ? "success" : "neutral"}
                />
              }
            />
          ) : null}
        </Ruled>
      </Panel>

      <Panel title="API">
        <Ruled>
          <SettingsRow
            description={`Requests without a Coss-Version header use this version. The SDK sends the version it was built for.${apiVersion.pinned === null ? " It is set on your first API request." : ""}${latest ? "" : settings.can_update ? ` Upgrade to ${apiVersion.latest} on coss.com.` : ""}`}
            label="API version"
            value={
              <View style={styles.version}>
                <Text selectable variant="mono">
                  {apiVersion.pinned ?? apiVersion.latest}
                </Text>
                {latest ? (
                  <Badge variant="outline">
                    <StatusDot label="Latest" tone="success" />
                  </Badge>
                ) : null}
              </View>
            }
          />
          <SettingsRow
            description="Include it when you contact support."
            label="Organization ID"
            stacked={
              <Text selectable variant="mono">
                {organization.id}
              </Text>
            }
          />
        </Ruled>
      </Panel>

      <RetentionPanel />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rule: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  ruleHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  version: { flexDirection: "row", alignItems: "center", gap: 8 },
});
