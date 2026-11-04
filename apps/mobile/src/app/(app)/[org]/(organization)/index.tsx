import type { BillingAlerts, OrganizationResponse } from "@coss/companion";
import { type Href, router } from "expo-router";
import {
  CreditCard,
  Folder,
  FolderPlus,
  Gauge,
  Globe,
  History,
  MessageSquare,
  Network,
  Settings,
  Users,
  Wallet,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../components/alert";
import { OrgAvatar } from "../../../../components/avatar";
import { Badge, StatusDot } from "../../../../components/badge";
import { EmptyState } from "../../../../components/empty";
import { Icon } from "../../../../components/icon";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { ProductGlyph } from "../../../../components/product-glyph";
import { RootToolbar } from "../../../../components/root-toolbar";
import { Screen } from "../../../../components/screen";
import { Text } from "../../../../components/text";
import { useActiveEnvironment } from "../../../../lib/active-environment";
import { formatCount, roleLabel } from "../../../../lib/format";
import { useOrganization } from "../../../../lib/queries";
import { STANDING_LABELS, standingTone } from "../../../../lib/status";

// apps/web/src/components/billing/billing-banner.tsx, without its calls to action: the app's billing
// is read-only, with no way to pay or buy (App Store guideline 3.1.1).
const HOLD_MESSAGES: Record<NonNullable<BillingAlerts["held"]>, string> = {
  delinquent: "An invoice is overdue. Sending resumes as soon as it is paid.",
  spend_limit: "This month's usage reached your spend limit. Sending resumes next month.",
  admin: "coss.com paused live sending for billing reasons. Contact support.",
};

function Alerts({ data }: { data: OrganizationResponse }) {
  const { organization, standing, billing } = data;
  const openReputation = () =>
    router.push({ pathname: "/[org]/reputation", params: { org: organization.slug } });
  // The app's billing page is read-only; without it, the alerts have no action.
  const billingAction = data.can.read_billing
    ? {
        label: "View billing",
        onPress: () =>
          router.push({ pathname: "/[org]/settings/billing", params: { org: organization.slug } }),
      }
    : undefined;
  const alerts = [];
  if (organization.suspended) {
    alerts.push(
      <Alert
        description="A coss.com administrator suspended this organization, so the dashboard is read-only."
        key="suspended"
        title="This organization is suspended"
        tone="error"
      />,
    );
  }
  if (standing.status === "suspended") {
    alerts.push(
      <Alert
        description={`coss.com suspended live sending for this organization (${standing.reason_label?.toLowerCase() ?? "reputation"}). Sandbox keys still work. Contact support to resume sending.`}
        action={{ label: "View reputation", onPress: openReputation }}
        key="standing"
        title="Live sending is suspended"
        tone="error"
      />,
    );
  } else if (standing.status === "warning") {
    alerts.push(
      <Alert
        description={`${standing.reason_label ?? "A reputation check"} is approaching the level at which coss.com suspends live sending automatically.`}
        action={{ label: "View reputation", onPress: openReputation }}
        key="standing"
        title="Your sending reputation needs attention"
        tone="warning"
      />,
    );
  }
  if (data.budget_paused) {
    // apps/web/src/app/[orgSlug]/layout.tsx
    alerts.push(
      <Alert
        action={{
          label: "Your spend",
          onPress: () =>
            router.push({ pathname: "/[org]/spend", params: { org: organization.slug } }),
        }}
        description="Your personal API keys reached your monthly budget: their live sends are paused until next month or until an owner raises it."
        key="budget"
        tone="error"
      />,
    );
  }
  if (billing?.held) {
    alerts.push(
      <Alert
        action={billingAction}
        description={`${HOLD_MESSAGES[billing.held]} Sandbox keys still work.`}
        key="hold"
        title="Live sending is paused"
        tone="error"
      />,
    );
  } else if (billing?.past_due) {
    alerts.push(
      <Alert
        action={billingAction}
        description="An invoice is past due."
        key="past-due"
        tone="warning"
      />,
    );
  } else if (billing?.allowance) {
    const { label, used, cap } = billing.allowance;
    const full = used >= cap;
    alerts.push(
      <Alert
        action={billingAction}
        description={
          full
            ? `You've used all ${formatCount(cap)} ${label} included this month: live sends are refused until next month.`
            : `You've used ${formatCount(used)} of the ${formatCount(cap)} ${label} included this month.`
        }
        key="allowance"
        tone={full ? "error" : "warning"}
      />,
    );
  }
  return alerts;
}

export default function OrganizationScreen() {
  const { org, params: active, select } = useActiveEnvironment();
  const query = useOrganization(org);
  if (query.isPending) {
    return (
      <Screen loading="list" title="Organization">
        <RootToolbar />
      </Screen>
    );
  }
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} title="Organization" />;
  }
  const data = query.data as OrganizationResponse;
  const openEnvironment = (project: string, env: string) => {
    select({ project, env });
    router.navigate({ pathname: "/[org]/(home)", params: { org } });
  };
  return (
    <Screen onRefresh={() => query.refetch()} title="Organization">
      <RootToolbar />
      <View style={styles.identity}>
        <OrgAvatar name={data.organization.name} size={44} />
        <View style={styles.identityText}>
          <Text numberOfLines={1} variant="heading">
            {data.organization.name}
          </Text>
          <View style={styles.identityMeta}>
            <Badge variant="outline">{roleLabel(data.organization.role)}</Badge>
            {data.organization.suspended ? <Badge variant="error">Suspended</Badge> : null}
            <Text muted variant="mono">
              {data.organization.slug}
            </Text>
          </View>
        </View>
      </View>
      <Alerts data={data} />
      {data.can.read_reputation ? (
        <Panel>
          <ListRow
            href={{ pathname: "/[org]/reputation", params: { org } }}
            leading={<ProductGlyph icon={Gauge} size={32} tone="neutral" />}
            subtitle="Bounce and complaint rates"
            title="Reputation"
            trailing={
              <Badge variant="outline">
                <StatusDot
                  label={STANDING_LABELS[data.standing.status]}
                  tone={standingTone(data.standing.status)}
                />
              </Badge>
            }
          />
        </Panel>
      ) : null}
      {data.projects.length === 0 ? (
        <Panel>
          <EmptyState
            description="Projects you create on coss.com appear here."
            icon={FolderPlus}
            title="No projects yet"
          />
        </Panel>
      ) : (
        data.projects.map((project) => (
          <Panel
            description="Each has its own API keys, emails, logs and webhooks."
            icon={Folder}
            key={project.id}
            title={project.name}
          >
            <Ruled>
              {project.environments.map((environment) => (
                <ListRow
                  detail={
                    active?.project === project.slug && active.env === environment.slug
                      ? "open"
                      : environment.mode
                  }
                  key={environment.id}
                  leading={<StatusDot tone={environment.mode === "live" ? "success" : "info"} />}
                  onPress={() => openEnvironment(project.slug, environment.slug)}
                  title={environment.name}
                />
              ))}
            </Ruled>
          </Panel>
        ))
      )}
      <Panel title="Organization">
        <Ruled>
          {[
            data.can.read_domain && { label: "Domains", path: "domains", icon: Globe },
            data.can.read_domain && {
              label: "Dedicated IPs",
              path: "dedicated-ips",
              icon: Network,
            },
            data.can.read_sms_sender && { label: "SMS", path: "sms", icon: MessageSquare },
            { label: "Members", path: "members", icon: Users },
            { label: "Spend", path: "spend", icon: Wallet },
            { label: "Settings", path: "settings", icon: Settings },
            data.can.read_billing && {
              label: "Billing",
              path: "settings/billing",
              icon: CreditCard,
            },
            data.can.read_audit && { label: "Audit log", path: "settings/audit", icon: History },
          ]
            .filter((item) => item !== false)
            .map((item) => (
              <ListRow
                href={`/${org}/${item.path}` as Href}
                key={item.path}
                leading={<Icon color="mutedForeground" icon={item.icon} size={18} />}
                title={item.label}
              />
            ))}
        </Ruled>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  identityText: { flex: 1, gap: 4 },
  identityMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
