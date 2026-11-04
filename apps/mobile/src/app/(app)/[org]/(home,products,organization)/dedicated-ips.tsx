import { useLocalSearchParams, useRouter } from "expo-router";
import { Network } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../components/alert";
import { Badge, StatusDot } from "../../../../components/badge";
import { EmptyState } from "../../../../components/empty";
import { Panel, Ruled } from "../../../../components/panel";
import { PageIntro, Screen } from "../../../../components/screen";
import { Stat, StatGrid } from "../../../../components/stat";
import { Text } from "../../../../components/text";
import { WebButton } from "../../../../components/web-button";
import { formatCount } from "../../../../lib/format";
import { useDedicatedIps } from "../../../../lib/queries-sms-senders";
import { DEDICATED_IP_STATUS } from "../../../../lib/status-sms-senders";
import { colors, space } from "../../../../lib/theme";

// Copy from apps/web/src/app/[orgSlug]/dedicated-ips/page.tsx. Read-only, without the add-on's price or a
// way to add it (App Store guideline 3.1.1).

// The dashboard's `formatDate` (apps/web/src/lib/billing-format.ts).
const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default function DedicatedIpsScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const router = useRouter();
  const query = useDedicatedIps(org);
  if (query.isPending) return <Screen title="Dedicated IPs" loading="list" />;
  if (query.isError && !query.data) {
    return <Screen title="Dedicated IPs" error={query.error} onRetry={() => query.refetch()} />;
  }
  const pool = query.data;
  const status = DEDICATED_IP_STATUS[pool.status];

  return (
    <Screen onRefresh={() => query.refetch()} title="Dedicated IPs">
      {/* Without the add-on, coss.com's page offers to buy it: no purchase links here (3.1.1). */}
      {pool.status === "not_enabled" ? null : <WebButton path={`/${org}/dedicated-ips`} />}
      <PageIntro
        description="Your own sending IPs, so no other sender's reputation affects yours. SES leases, scales and warms them up automatically."
        meta={
          status ? (
            <Badge variant="outline">
              <StatusDot label={status.label} tone={status.tone} />
            </Badge>
          ) : null
        }
        title="Dedicated IPs"
      />

      {pool.status === "not_enabled" ? (
        <Panel>
          <EmptyState
            tone="email"
            description={`An add-on of the ${pool.add_on.plans.join(" and ")} plans. Best for steady volume: the first IP is assigned once you send a few hundred emails a day.`}
            icon={Network}
            title="Dedicated IPs aren't on your plan"
          />
        </Panel>
      ) : (
        <>
          {status ? (
            <Alert
              description={`${status.detail}${pool.message ? ` ${pool.message}` : ""}`}
              tone={pool.status === "waiting" ? "warning" : "info"}
            />
          ) : null}
          <StatGrid>
            <Stat label="IPs" value={String(pool.ips.length)} />
            <Stat
              detail={
                pool.dedicated_share === null
                  ? `shown from ${formatCount(pool.ready_min_deliveries)} deliveries`
                  : "of deliveries, last 7 days"
              }
              label="From your IPs"
              value={
                pool.dedicated_share === null ? "—" : `${Math.round(pool.dedicated_share * 100)}%`
              }
            />
            <Stat
              label="Delivered, last 7 days"
              value={formatCount(pool.ips.reduce((total, ip) => total + ip.delivered_7d, 0))}
            />
            <Stat
              label="Ready since"
              value={pool.ready_at ? DATE.format(new Date(pool.ready_at)) : "—"}
            />
          </StatGrid>
          <Panel
            description="SES adds IPs as your volume grows and removes them when it drops. Only live emails use them."
            title="IP addresses"
          >
            {pool.ips.length ? (
              <View>
                <View style={[styles.ip, styles.head]}>
                  <Text muted style={styles.fill} variant="small">
                    IP
                  </Text>
                  <Text muted variant="small">
                    Delivered, last 7 days
                  </Text>
                </View>
                <Ruled>
                  {pool.ips.map((ip) => (
                    <View key={ip.ip} style={styles.ip}>
                      <Text selectable style={styles.fill} variant="mono">
                        {ip.ip}
                      </Text>
                      <Text variant="mono">{formatCount(ip.delivered_7d)}</Text>
                    </View>
                  ))}
                </Ruled>
              </View>
            ) : (
              <EmptyState
                tone="email"
                description="SES assigns the first IP once you send a few hundred emails a day over a few days. Until then, emails leave from shared IPs."
                icon={Network}
                title="No IPs yet"
              />
            )}
          </Panel>
          <Text muted variant="small">
            Keeping a dedicated IP's reputation is up to its sender: watch bounces and complaints on
            the{" "}
            <Text
              onPress={() => router.push({ pathname: "/[org]/reputation", params: { org } })}
              style={styles.link}
              variant="small"
            >
              Reputation page
            </Text>
            .
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  head: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fill: { flex: 1 },
  link: { textDecorationLine: "underline" },
});
