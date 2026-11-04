import { getProduct, isProductKey } from "@coss/dashboard-routes";
import { formatRetentionDays, RETENTION_DAYS } from "@coss/retention";
import { type Href, Link, useLocalSearchParams } from "expo-router";
import { Mail } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { ActivityChart } from "../../../../../../../../components/activity-chart";
import { Button } from "../../../../../../../../components/button";
import { EmailRow } from "../../../../../../../../components/email-row";
import { EmptyState } from "../../../../../../../../components/empty";
import { Icon } from "../../../../../../../../components/icon";
import { ListRow, Panel, PanelBody, Ruled } from "../../../../../../../../components/panel";
import { ProductGlyph } from "../../../../../../../../components/product-glyph";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Stat, StatGrid } from "../../../../../../../../components/stat";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatCompact, formatPercent } from "../../../../../../../../lib/format";
import { PRODUCT_ICONS, pageHref, pagesFor } from "../../../../../../../../lib/products";
import { useEmails, useEnvironment, useOrganization } from "../../../../../../../../lib/queries";
import { space } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

function EmailOverview({ params, base }: { params: EnvironmentParams; base: string }) {
  const environment = useEnvironment(params);
  const emails = useEmails(params, null);
  const data = environment.data;
  if (!data) return null;
  const { totals } = data.activity;
  const attempted = totals.sent + totals.failed;
  const recent = emails.data?.pages[0]?.data.slice(0, 5) ?? [];
  return (
    <>
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
          <ActivityChart days={data.activity.days} />
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
        {emails.isError && !emails.data ? (
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
            tone="email"
          />
        ) : recent.length === 0 ? (
          <EmptyState
            description="Emails sent with this environment's keys show up here."
            icon={Mail}
            title="No emails yet"
            tone="email"
          />
        ) : (
          <Ruled>
            {recent.map((email) => (
              <EmailRow email={email} key={email.id} params={params} />
            ))}
          </Ruled>
        )}
      </Panel>
    </>
  );
}

/** A product in an environment: what it is and its pages, with Email's overview on top. */
export default function ProductScreen() {
  const { product: key, ...params } = useLocalSearchParams<
    EnvironmentParams & { product: string }
  >();
  const organization = useOrganization(params.org);
  if (!isProductKey(key)) {
    return <Screen error={new Error("This product doesn't exist.")} onRetry={() => {}} />;
  }
  const product = getProduct(key);
  const base = environmentPath(params);
  const pages = pagesFor(key, organization.data?.can);
  return (
    <Screen onRefresh={() => organization.refetch()} title={product.name}>
      <WebButton path={`${base}/products/${key}`} />
      <View style={styles.intro}>
        <ProductGlyph icon={PRODUCT_ICONS[key]} size={40} tone={key} />
        <View style={styles.introText}>
          <PageIntro description={product.description} />
        </View>
      </View>
      {key === "email" && organization.data?.can.read_email ? (
        <EmailOverview base={base} params={params} />
      ) : null}
      {pages.length > 0 ? (
        <Panel>
          <Ruled>
            {pages.map((page) => (
              <ListRow
                href={pageHref(page, params.org, base) as Href}
                key={page.label}
                leading={<Icon color="mutedForeground" icon={page.icon} size={18} />}
                title={page.label}
              />
            ))}
          </Ruled>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: "row", alignItems: "center", gap: space.md },
  introText: { flex: 1 },
  viewAll: { paddingVertical: space.xs },
});
