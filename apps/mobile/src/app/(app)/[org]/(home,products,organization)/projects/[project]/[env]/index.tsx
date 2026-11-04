import type { OrganizationResponse } from "@coss/companion";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { type Href, Link, router, useLocalSearchParams } from "expo-router";
import {
  Ban,
  Bookmark,
  Boxes,
  Cable,
  ContactRound,
  Database,
  Filter,
  Gauge,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  ListFilter,
  type LucideIcon,
  Mail,
  Megaphone,
  MessageSquare,
  MessageSquareReply,
  MessageSquareX,
  MousePointerClick,
  PanelsTopLeft,
  Scale,
  ScrollText,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Tags,
  UsersRound,
  Webhook,
} from "lucide-react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ActivityChart } from "../../../../../../../components/activity-chart";
import { Badge, StatusDot } from "../../../../../../../components/badge";
import { Button } from "../../../../../../../components/button";
import { EmailRow } from "../../../../../../../components/email-row";
import { EmptyState } from "../../../../../../../components/empty";
import { Icon } from "../../../../../../../components/icon";
import { ListRow, Panel, PanelBody, Ruled } from "../../../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../../components/stat";
import { Segmented } from "../../../../../../../components/tabs";
import { Text } from "../../../../../../../components/text";
import { formatCompact, formatPercent } from "../../../../../../../lib/format";
import { useEmails, useEnvironment, useOrganization } from "../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../lib/web";

type Destination = {
  label: string;
  path: string;
  icon: LucideIcon;
  can: keyof OrganizationResponse["can"];
};

// The dashboard sidebar's environment groups (apps/web/src/lib/navigation.ts).
const SECTIONS: { label: string; items: Destination[] }[] = [
  {
    label: "Email",
    items: [
      { label: "Emails", path: "emails", icon: Mail, can: "read_email" },
      { label: "Templates", path: "templates", icon: LayoutTemplate, can: "read_template" },
      { label: "Received", path: "received", icon: Inbox, can: "read_email" },
      { label: "Suppressions", path: "suppressions", icon: Ban, can: "read_suppression" },
      { label: "Tracking", path: "tracking", icon: MousePointerClick, can: "read_environment" },
      {
        label: "Content storage",
        path: "content-storage",
        icon: Database,
        can: "read_environment",
      },
    ],
  },
  {
    label: "SMS",
    items: [
      { label: "Messages", path: "sms", icon: MessageSquare, can: "read_sms" },
      { label: "Received", path: "sms/received", icon: MessageSquareReply, can: "read_sms" },
      {
        label: "Suppressions",
        path: "sms/suppressions",
        icon: MessageSquareX,
        can: "read_sms_suppression",
      },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Broadcasts", path: "broadcasts", icon: Send, can: "read_broadcast" },
      { label: "Contacts", path: "contacts", icon: ContactRound, can: "read_contact" },
      { label: "Audiences", path: "audiences", icon: UsersRound, can: "read_contact" },
      { label: "Segments", path: "segments", icon: Filter, can: "read_contact" },
      { label: "Topics", path: "topics", icon: Bookmark, can: "read_contact" },
      { label: "Settings", path: "marketing", icon: Megaphone, can: "read_contact" },
    ],
  },
  {
    label: "Risk",
    items: [
      { label: "Assessments", path: "risk", icon: ShieldAlert, can: "read_risk" },
      { label: "Rules", path: "risk/rules", icon: ListFilter, can: "read_risk_rule" },
      { label: "Lists", path: "risk/lists", icon: ListChecks, can: "read_risk_list" },
      { label: "Rate limits", path: "risk/limits", icon: Gauge, can: "read_risk" },
      { label: "Calibration", path: "risk/calibration", icon: Scale, can: "read_risk" },
      { label: "Settings", path: "risk/settings", icon: SlidersHorizontal, can: "read_risk" },
    ],
  },
  {
    label: "Hooks",
    items: [
      { label: "Applications", path: "hooks", icon: Boxes, can: "read_hook" },
      { label: "Event types", path: "hooks/event-types", icon: Tags, can: "read_hook" },
      { label: "Portal settings", path: "hooks/settings", icon: PanelsTopLeft, can: "read_hook" },
    ],
  },
  {
    label: "Developers",
    items: [
      { label: "API keys", path: "api-keys", icon: KeyRound, can: "read_api_key" },
      { label: "Webhooks", path: "webhooks", icon: Webhook, can: "read_webhook" },
      { label: "Logs", path: "logs", icon: ScrollText, can: "read_log" },
      { label: "Log drains", path: "log-drains", icon: Cable, can: "read_log_drain" },
    ],
  },
];

export default function EnvironmentScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const environment = useEnvironment(params);
  const emails = useEmails(params, null);
  const organization = useOrganization(params.org);
  const siblings =
    organization.data?.projects.find((project) => project.slug === params.project)?.environments ??
    [];

  if (environment.isPending) return <Loading />;
  if (environment.isError && !environment.data) {
    return <ErrorState error={environment.error} onRetry={() => environment.refetch()} />;
  }

  const { project, activity } = environment.data;
  const env = environment.data.environment;
  const { totals } = activity;
  const attempted = totals.sent + totals.failed;
  const recent = emails.data?.pages[0]?.data.slice(0, 5) ?? [];
  const base = environmentPath(params);

  return (
    <Screen
      onRefresh={() =>
        Promise.all([environment.refetch(), emails.refetch(), organization.refetch()])
      }
      title={env.name}
    >
      <PageIntro
        title={`${project.name} · ${env.name}`}
        description={
          env.mode === "live"
            ? "Production: emails are delivered through the live provider."
            : "Development: emails are recorded and run through every check, but never delivered."
        }
        meta={
          <>
            <Badge variant="outline">
              <StatusDot
                label={env.mode === "live" ? "Live" : "Sandbox"}
                tone={env.mode === "live" ? "success" : "info"}
              />
            </Badge>
            <Text muted variant="mono">
              {project.slug}
            </Text>
          </>
        }
      />
      {siblings.length > 1 ? (
        <Segmented
          items={siblings.map((sibling) => ({
            value: sibling.slug,
            label: sibling.name,
            tone: sibling.mode === "live" ? "success" : "info",
          }))}
          onChange={(slug) =>
            router.replace({
              pathname: "/[org]/projects/[project]/[env]",
              params: { org: params.org, project: params.project, env: slug },
            })
          }
          value={env.slug}
        />
      ) : null}
      <StatGrid>
        <Stat detail="last 14 days" label="Sent" value={formatCompact(totals.sent)} />
        <Stat
          detail={
            attempted > 0 ? `${formatPercent(totals.failed / attempted)} of sends` : "no sends"
          }
          label="Failed"
          value={formatCompact(totals.failed)}
        />
        <Stat
          detail={
            totals.tracked_opens > 0
              ? `${formatCompact(totals.opened)} of ${formatCompact(totals.tracked_opens)} tracked`
              : "tracking off"
          }
          label="Open rate"
          value={
            totals.tracked_opens > 0 ? formatPercent(totals.opened / totals.tracked_opens) : "—"
          }
        />
        <Stat
          detail={
            totals.tracked_clicks > 0
              ? `${formatCompact(totals.clicked)} of ${formatCompact(totals.tracked_clicks)} tracked`
              : "tracking off"
          }
          label="Click rate"
          value={
            totals.tracked_clicks > 0 ? formatPercent(totals.clicked / totals.tracked_clicks) : "—"
          }
        />
      </StatGrid>
      <Panel meta="last 14 days · UTC" title="Activity">
        <PanelBody>
          <ActivityChart days={activity.days} />
        </PanelBody>
      </Panel>
      <Panel
        action={
          <Link href={`${base}/emails` as Href} style={styles.viewAll}>
            <Text variant="smallMedium">View all →</Text>
          </Link>
        }
        description={`Emails are kept for ${formatRetentionDays(RETENTION_DAYS.emails)}.`}
        title="Recent emails"
      >
        {emails.isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : emails.isError && !emails.data ? (
          <EmptyState
            action={
              <Button
                onPress={() => void emails.refetch()}
                size="sm"
                title="Try again"
                variant="outline"
              />
            }
            description={emails.error.message}
            icon={Mail}
            title="Couldn't load this"
          />
        ) : recent.length === 0 ? (
          <EmptyState
            description="Emails sent with this environment's keys show up here."
            icon={Mail}
            title="No emails yet"
          />
        ) : (
          <Ruled>
            {recent.map((email) => (
              <EmailRow email={email} key={email.id} params={params} />
            ))}
          </Ruled>
        )}
      </Panel>
      {SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => organization.data?.can[item.can] ?? false),
      }))
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <Panel key={section.label} title={section.label}>
            <Ruled>
              {section.items.map((item) => (
                <ListRow
                  href={`${base}/${item.path}` as Href}
                  key={item.path}
                  leading={<Icon color="mutedForeground" icon={item.icon} size={18} />}
                  title={item.label}
                />
              ))}
            </Ruled>
          </Panel>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewAll: { paddingVertical: 4 },
  loading: { paddingVertical: 32 },
});
