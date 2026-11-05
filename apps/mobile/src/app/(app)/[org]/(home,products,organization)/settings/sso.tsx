import type { SsoSettingsResponse } from "@coss/companion";
import { useLocalSearchParams } from "expo-router";
import { Circle, CircleCheck } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../components/alert";
import { Badge, StatusDot } from "../../../../../components/badge";
import { Icon } from "../../../../../components/icon";
import { SettingsRow, SettingsValue } from "../../../../../components/organization-settings";
import { Panel, PanelBody, Ruled } from "../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../components/screen";
import { Text } from "../../../../../components/text";
import { WebButton } from "../../../../../components/web-button";
import { useSsoSettings } from "../../../../../lib/queries-organization-settings";
import { ssoProviderStatus } from "../../../../../lib/status-organization-settings";

// Copy from the dashboard's SSO tab (apps/web/src/app/[orgSlug]/settings/sso/page.tsx and
// sso-forms.tsx). Read-only: saving the provider, requiring SSO and removing it stay on coss.com.

type Sso = SsoSettingsResponse;

function inactiveMessage(sso: Sso, provider: NonNullable<Sso["provider"]>): string {
  const unverified = provider.unverified_domains;
  const one = unverified.length === 1;
  const text =
    unverified.length > 0
      ? `${unverified.join(", ")} ${one ? "is" : "are"} no longer verified. Verify ${one ? "it" : "them"} again under Domains, or remove ${one ? "it" : "them"} from the provider and save.`
      : "coss.com support disabled this provider. Check its configuration and save it to turn it back on.";
  return sso.required
    ? `${text} Members can't open this organization until it works again; owners still can.`
    : text;
}

/** One precondition of requiring SSO: a check once it holds, an open circle until then. */
function Requirement(props: { done: boolean; children: string }) {
  return (
    <View style={styles.requirement}>
      <Icon
        color={props.done ? "success" : "mutedForeground"}
        icon={props.done ? CircleCheck : Circle}
        size={16}
      />
      <Text muted={props.done} style={styles.flex} variant="small">
        {props.children}
      </Text>
    </View>
  );
}

function ProviderPanel({ sso }: { sso: Sso }) {
  const { provider } = sso;
  if (!provider) {
    return (
      <Panel
        description="Let members sign in through Okta, Microsoft Entra ID, Google Workspace or any OpenID Connect or SAML 2.0 provider. People at your verified domains join as members the first time they sign in."
        footer={sso.setup ? undefined : "Only owners and admins can change the identity provider."}
        title="Identity provider"
      >
        {sso.plan_allows ? null : (
          <PanelBody>
            <Text variant="small">Single sign-on is part of the Scale plan.</Text>
          </PanelBody>
        )}
      </Panel>
    );
  }
  const [tone, label] = ssoProviderStatus(provider.active);
  return (
    <Panel
      action={
        <Badge variant="outline">
          <StatusDot label={label} tone={tone} />
        </Badge>
      }
      description={`${provider.type === "saml" ? "SAML 2.0" : "OpenID Connect"} · ${provider.domains.join(", ")} · ${provider.linked_members} of ${sso.members} member${sso.members === 1 ? "" : "s"} signed in with SSO so far.`}
      footer={sso.setup ? undefined : "Only owners and admins can change the identity provider."}
      title="Identity provider"
    >
      <Ruled>
        <SettingsRow
          label="Protocol"
          value={
            <Text variant="small">{provider.type === "saml" ? "SAML" : "OpenID Connect"}</Text>
          }
        />
        {provider.oidc ? (
          <SettingsRow
            label="Issuer URL"
            stacked={<SettingsValue>{provider.oidc.issuer}</SettingsValue>}
          />
        ) : null}
        {provider.oidc ? (
          <SettingsRow
            label="Client ID"
            stacked={<SettingsValue>{provider.oidc.client_id}</SettingsValue>}
          />
        ) : null}
        {provider.saml ? (
          <SettingsRow
            label="SSO URL"
            stacked={<SettingsValue>{provider.saml.sso_url}</SettingsValue>}
          />
        ) : null}
        {provider.saml?.idp_entity_id ? (
          <SettingsRow
            label="IdP entity ID (issuer)"
            stacked={<SettingsValue>{provider.saml.idp_entity_id}</SettingsValue>}
          />
        ) : null}
        <SettingsRow
          label="Domains"
          stacked={
            <Text selectable variant="mono">
              {provider.domains.join(", ")}
            </Text>
          }
        />
      </Ruled>
    </Panel>
  );
}

function SetupPanel({ setup }: { setup: NonNullable<Sso["setup"]> }) {
  const values = [
    ["OpenID Connect redirect URI", setup.oidc_redirect_uri],
    ["SAML ACS URL", setup.saml_acs_url],
    ["SAML entity ID (audience)", setup.saml_entity_id],
    ["SAML metadata URL", setup.saml_metadata_url],
  ] as const;
  return (
    <Panel
      description="Create an application in your identity provider with these values."
      title="Values for your identity provider"
    >
      <Ruled>
        {values.map(([label, value]) =>
          value ? (
            <SettingsRow
              key={label}
              label={label}
              stacked={<SettingsValue>{value}</SettingsValue>}
            />
          ) : null,
        )}
      </Ruled>
    </Panel>
  );
}

function RequirePanel({ sso }: { sso: Sso }) {
  const { requirement } = sso;
  return (
    <Panel
      action={
        sso.required ? (
          <Badge variant="outline">
            <StatusDot label="Required" tone="success" />
          </Badge>
        ) : null
      }
      description="SSO sign-ins also satisfy the organization's two-factor requirement: your identity provider is responsible for multi-factor authentication."
      title="Require SSO"
    >
      <Ruled>
        <SettingsRow
          description={
            requirement
              ? sso.required
                ? "Members and admins must sign in with SSO to open this organization. Owners can still use their password in an emergency."
                : "Make SSO the only way members and admins can open this organization. Owners keep password access in case the identity provider fails."
              : "Only owners can change this."
          }
          label="Require SSO for members and admins"
          value={
            <StatusDot
              label={sso.required ? "Required" : "Not required"}
              muted
              tone={sso.required ? "success" : "neutral"}
            />
          }
        />
        {requirement && !sso.required ? (
          <PanelBody gap={8}>
            <Text variant="small">Before you can require it:</Text>
            <Requirement done={requirement.active_provider}>
              Set up an active identity provider.
            </Requirement>
            <Requirement done={requirement.signed_in_with_sso}>
              Sign in with SSO yourself.
            </Requirement>
            <Requirement done={requirement.has_password}>
              Have a password on your account, for break-glass access (use “Forgot password” on the
              sign-in page to set one).
            </Requirement>
          </PanelBody>
        ) : null}
        {requirement && requirement.owners_without_password.length > 0 ? (
          <PanelBody>
            <Text muted variant="small">
              Without a password, these owners have no break-glass access:{" "}
              {requirement.owners_without_password.join(", ")}.
            </Text>
          </PanelBody>
        ) : null}
      </Ruled>
    </Panel>
  );
}

export default function SingleSignOnScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useSsoSettings(org);
  if (query.isPending) return <Screen title="Single sign-on" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Single sign-on" error={query.error} onRetry={() => query.refetch()} />;
  }
  const sso = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Single sign-on">
      {/* Without the plan, coss.com's page is an upgrade prompt: no purchase links here (3.1.1). */}
      {sso.plan_allows || sso.provider ? <WebButton path={`/${org}/settings/sso`} /> : null}
      <PageIntro title="Single sign-on" />
      {sso.provider && !sso.provider.active ? (
        <Alert
          description={inactiveMessage(sso, sso.provider)}
          title="SSO is not active"
          tone="warning"
        />
      ) : null}
      <ProviderPanel sso={sso} />
      {sso.setup ? <SetupPanel setup={sso.setup} /> : null}
      <RequirePanel sso={sso} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  requirement: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
});
