import type { EnvironmentHomeResponse, HomeAttention, HomeSeverity } from "@coss/companion";
import { getProduct, type ProductKey } from "@coss/dashboard-routes";
import * as Haptics from "expo-haptics";
import { type Href, Link, router } from "expo-router";
import { ArrowRight, Check, ChevronRight, Code, Webhook } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { formatAgo, formatCompact } from "../lib/format";
import { ATTENTION_ICONS, attentionHref, PRODUCT_ICONS, productHref } from "../lib/products";
import { useMe, useOrganization } from "../lib/queries";
import { useEnvironmentHome } from "../lib/queries-scheduling";
import { colors, radius, space, type Tone, useFinish, useProductText } from "../lib/theme";
import { type EnvironmentParams, environmentPath, openOnWeb } from "../lib/web";
import { Badge, StatusDot } from "./badge";
import { CountUp } from "./count-up";
import { DraftingGrid } from "./empty";
import { Icon } from "./icon";
import { ListRow, Panel, PanelBody, Ruled } from "./panel";
import { ProductGlyph } from "./product-glyph";
import { RootToolbar } from "./root-toolbar";
import { Screen } from "./screen";
import { SectionHeading } from "./section-heading";
import { Sparkline } from "./sparkline";
import { Text } from "./text";

const SEVERITY_TONE: Record<HomeSeverity, Tone> = {
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
  neutral: "neutral",
};

function Welcome(props: { home: EnvironmentHomeResponse; firstName: string | undefined }) {
  const { home } = props;
  const inUse = home.products.filter((product) => !product.elsewhere);
  return (
    <View style={styles.welcome}>
      <DraftingGrid />
      <View style={styles.welcomeFade} />
      <View style={styles.welcomeLine}>
        <Text muted numberOfLines={1} style={styles.flexShrink} variant="small">
          {home.project.name} · {home.environment.name}
        </Text>
        <Badge variant="outline">
          <StatusDot
            label={home.environment.mode === "live" ? "Live" : "Sandbox"}
            tone={home.environment.mode === "live" ? "success" : "info"}
          />
        </Badge>
      </View>
      <Text variant="title">Welcome back{props.firstName ? `, ${props.firstName}` : ""}</Text>
      <Text muted variant="body">
        {home.summary}
      </Text>
      {inUse.length > 0 ? (
        <View style={styles.stack}>
          {inUse.slice(0, 6).map((product, index) => (
            <View key={product.key} style={[styles.stackTile, index > 0 && styles.stackOverlap]}>
              <ProductGlyph icon={PRODUCT_ICONS[product.key]} size={36} tone={product.key} />
            </View>
          ))}
          <Text muted style={styles.stackLabel} variant="small">
            {inUse.length} {inUse.length === 1 ? "product" : "products"} in use
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AttentionRow(props: { item: HomeAttention; href: string | null; webPath: string }) {
  const { item, href } = props;
  const body = (pressed: boolean) => (
    <View style={[styles.attentionRow, pressed && styles.pressed]}>
      <ProductGlyph icon={ATTENTION_ICONS[item.key]} size={36} tone={item.tone} />
      <View style={styles.attentionText}>
        <View style={styles.attentionTitle}>
          <StatusDot tone={SEVERITY_TONE[item.severity]} />
          <Text numberOfLines={2} style={styles.flexShrink} variant="label">
            {item.title}
          </Text>
        </View>
        <Text muted variant="small">
          {item.description}
        </Text>
      </View>
      <Icon color="mutedForeground" icon={ChevronRight} size={16} />
    </View>
  );
  if (href) {
    return (
      <Link asChild href={href as Href} onPress={() => void Haptics.selectionAsync()}>
        <Pressable>{({ pressed }) => body(pressed)}</Pressable>
      </Link>
    );
  }
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        openOnWeb(props.webPath);
      }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

function ProductCell(props: {
  product: EnvironmentHomeResponse["products"][number];
  days: number;
  href: string | null;
  webPath: string;
}) {
  const { product } = props;
  const sparkline = useProductText(product.key);
  const name = getProduct(product.key).name;
  const open = () => {
    void Haptics.selectionAsync();
    if (props.href) router.push(props.href as Href);
    else openOnWeb(props.webPath);
  };
  return (
    <Pressable
      accessibilityLabel={`${name}: ${product.count} ${product.count === 1 ? product.one : product.many}`}
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
    >
      <View style={styles.cellHeader}>
        <ProductGlyph icon={PRODUCT_ICONS[product.key]} tone={product.key} />
        <Text numberOfLines={1} style={styles.flexShrink} variant="label">
          {name}
        </Text>
      </View>
      {product.elsewhere ? (
        <Text muted numberOfLines={2} variant="small">
          {product.elsewhere}
        </Text>
      ) : (
        <>
          <View style={styles.cellFigure}>
            <CountUp value={formatCompact(product.count)} variant="heading" style={styles.figure} />
            <Text muted numberOfLines={1} style={styles.flexShrink} variant="small">
              {product.count === 1 ? product.one : product.many}
            </Text>
          </View>
          <Sparkline color={sparkline} id={product.key} height={28} values={product.daily} />
        </>
      )}
    </Pressable>
  );
}

/** The dashboard's environment home, for the active environment or the one a link names. */
export function EnvironmentHome(props: {
  params: EnvironmentParams | null;
  pending?: boolean;
  /** A tab root: its native bar carries the environment and account. */
  root?: boolean;
}) {
  const { params } = props;
  const finish = useFinish();
  const home = useEnvironmentHome(params);
  const me = useMe();
  const organization = useOrganization(params?.org ?? "");
  const base = params ? environmentPath(params) : "";
  const can = organization.data?.can;
  const toolbar = props.root ? <RootToolbar environment /> : null;

  if (props.pending || !params || home.isPending) {
    return (
      <Screen loading="stats" title="Home">
        {toolbar}
      </Screen>
    );
  }
  if (home.isError && !home.data) {
    return <Screen error={home.error} onRetry={() => home.refetch()} title="Home" />;
  }
  const data = home.data as EnvironmentHomeResponse;
  const firstName = me.data?.user.name?.trim().split(/\s+/)[0];
  const { org } = params;
  const rows = [];
  for (let i = 0; i < data.products.length; i += 2) rows.push(data.products.slice(i, i + 2));
  const webPath = (key: ProductKey) => `${base}/${key}`;

  return (
    <Screen onRefresh={() => home.refetch()} title="Home">
      {toolbar}
      <Welcome firstName={firstName} home={data} />
      <View>
        <SectionHeading title="Needs your attention" />
        <View style={[styles.frame, { boxShadow: finish.panel }]}>
          {data.attention.length > 0 ? (
            <Ruled>
              {data.attention.map((item) => (
                <AttentionRow
                  href={attentionHref(item.key, org, base)}
                  item={item}
                  key={item.key}
                  webPath={`${base}/${item.key}`}
                />
              ))}
            </Ruled>
          ) : (
            <View style={styles.attentionRow}>
              <View style={styles.clearTile}>
                <Icon color="successForeground" icon={Check} size={18} strokeWidth={2.25} />
              </View>
              <View style={styles.attentionText}>
                <Text variant="label">All clear</Text>
                <Text muted variant="small">
                  No failed sends, failing endpoints or reviews waiting on you.
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      {data.products.length > 0 ? (
        <View>
          <SectionHeading detail={`${data.days} days`} title="Your products" />
          <View style={[styles.frame, { boxShadow: finish.panel }]}>
            {rows.map((row, index) => (
              <View key={row[0]?.key} style={[styles.gridRow, index > 0 && styles.gridRule]}>
                {row.map((product, column) => (
                  <View
                    key={product.key}
                    style={[styles.gridCell, column > 0 && styles.gridCellRule]}
                  >
                    <ProductCell
                      days={data.days}
                      href={productHref(product.key, base, can)}
                      product={product}
                      webPath={webPath(product.key)}
                    />
                  </View>
                ))}
                {row.length === 1 ? <View style={[styles.gridCell, styles.gridCellRule]} /> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {data.activity ? (
        <Panel
          action={
            <Link href={`${base}/logs` as Href} style={styles.viewAll}>
              <View style={styles.viewAllInner}>
                <Text variant="smallMedium">All logs</Text>
                <Icon icon={ArrowRight} size={14} />
              </View>
            </Link>
          }
          title="Recent activity"
        >
          {data.activity.length === 0 ? (
            <PanelBody>
              <Text muted variant="small">
                Nothing in the last week. Requests and events show up here as they happen.
              </Text>
            </PanelBody>
          ) : (
            <Ruled>
              {data.activity.map((line) => (
                <ListRow
                  detail={formatAgo(line.occurred_at)}
                  key={line.id}
                  leading={
                    <ProductGlyph
                      icon={
                        line.product
                          ? PRODUCT_ICONS[line.product]
                          : line.source === "webhook"
                            ? Webhook
                            : Code
                      }
                      tone={line.product ?? "neutral"}
                    />
                  }
                  subtitle={line.type ?? undefined}
                  title={line.count > 1 ? `${line.title} ×${line.count}` : line.title}
                />
              ))}
            </Ruled>
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  pressed: { backgroundColor: colors.muted },
  welcome: {
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  welcomeFade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.card,
    opacity: 0.6,
  },
  welcomeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xs,
  },
  stack: { flexDirection: "row", alignItems: "center", marginTop: space.md },
  stackTile: { borderRadius: radius.xl, backgroundColor: colors.card, padding: space.xxs },
  stackOverlap: { marginLeft: -10 },
  stackLabel: { marginLeft: space.md },
  frame: {
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  attentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  attentionText: { flex: 1, gap: space.xxs },
  attentionTitle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  clearTile: {
    width: 36,
    height: 36,
    borderRadius: radius.xl - 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.successTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder,
  },
  gridRow: { flexDirection: "row" },
  gridRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  gridCell: { flex: 1 },
  gridCellRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  cell: { flex: 1, gap: space.sm, padding: space.lg, minHeight: 124 },
  cellHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cellFigure: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  figure: { fontSize: 19, lineHeight: 24 },
  viewAll: { paddingVertical: space.xs },
  viewAllInner: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
