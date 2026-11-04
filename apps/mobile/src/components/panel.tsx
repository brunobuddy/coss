import * as Haptics from "expo-haptics";
import { type Href, Link } from "expo-router";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Children, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, type ProductTone, radius, space, useFinish } from "../lib/theme";
import { Icon } from "./icon";
import { ProductGlyph } from "./product-glyph";
import { Text } from "./text";

/**
 * The dashboard's `Panel` (coss ui's framed card): the header and footer sit on the muted tray,
 * the content in the raised card inside it.
 */
export function Panel(props: {
  title?: string;
  description?: ReactNode;
  /** Mono description (a slug or id under the title). */
  descriptionMono?: boolean;
  /** An icon tile before the title, like the dashboard's project cards. */
  icon?: LucideIcon;
  /** The product that icon belongs to: its tile takes the product's colour. */
  tone?: ProductTone;
  /** Right of the title: a mono measure ("last 14 days · UTC") or a count. */
  meta?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const header = props.title || props.description || props.meta || props.action;
  const finish = useFinish();
  return (
    <View style={[styles.frame, { boxShadow: finish.panel }]}>
      {header ? (
        <View style={styles.header}>
          {props.icon ? (
            <ProductGlyph icon={props.icon} size={32} tone={props.tone ?? "neutral"} />
          ) : null}
          <View style={styles.headerText}>
            {props.title ? <Text variant="heading">{props.title}</Text> : null}
            {props.description ? (
              <Text muted variant={props.descriptionMono ? "mono" : "small"}>
                {props.description}
              </Text>
            ) : null}
          </View>
          {props.meta ? (
            <Text muted variant="mono">
              {props.meta}
            </Text>
          ) : null}
          {props.action}
        </View>
      ) : null}
      {props.children ? (
        <View style={[styles.card, !header && styles.cardTop, !props.footer && styles.cardBottom]}>
          {props.children}
        </View>
      ) : null}
      {props.footer ? (
        <View style={styles.footer}>
          {typeof props.footer === "string" ? (
            <Text muted variant="small">
              {props.footer}
            </Text>
          ) : (
            props.footer
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Padded content inside a `Panel`'s card. */
export function PanelBody(props: { children: ReactNode; gap?: number }) {
  return <View style={[styles.body, { gap: props.gap ?? 12 }]}>{props.children}</View>;
}

/** Children ruled by hairlines, like the dashboard's card tables. */
export function Ruled(props: { children: ReactNode; inset?: number }) {
  const rows = Children.toArray(props.children);
  return rows.map((row, index) => (
    <Fragment key={(row as { key?: string }).key ?? index}>
      {index > 0 ? <View style={[styles.rule, { marginLeft: props.inset ?? 0 }]} /> : null}
      {row}
    </Fragment>
  ));
}

/** A list row: optional leading mark, title and subtitle, trailing value, a chevron when it links. */
export function ListRow(props: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** A mono value on the right ("live", "2m ago"). */
  detail?: string;
  href?: Href;
  onPress?: () => void;
  titleLines?: number;
  /** It leaves the app: the trailing mark says so instead of a chevron. */
  external?: boolean;
}) {
  // With a subtitle and a detail, the detail sits beside the title and the trailing mark beside
  // the subtitle, so neither line gives up its width to both.
  const twoLines = Boolean(props.subtitle && props.detail);
  const detail = props.detail ? (
    <Text muted numberOfLines={1} style={styles.rowDetail} variant="mono">
      {props.detail}
    </Text>
  ) : null;
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.rowPressed]}>
      {props.leading}
      <View style={styles.rowText}>
        <View style={styles.rowLine}>
          <Text numberOfLines={props.titleLines ?? 1} style={styles.rowFill} variant="label">
            {props.title}
          </Text>
          {twoLines ? detail : null}
        </View>
        {props.subtitle ? (
          <View style={styles.rowLine}>
            <Text muted numberOfLines={1} style={styles.rowFill} variant="small">
              {props.subtitle}
            </Text>
            {twoLines ? props.trailing : null}
          </View>
        ) : null}
      </View>
      {twoLines ? null : detail}
      {twoLines ? null : props.trailing}
      {(props.href || props.onPress) && !props.external ? (
        <Icon color="mutedForeground" icon={ChevronRight} size={16} />
      ) : null}
    </View>
  );
  if (props.href) {
    return (
      <Link asChild href={props.href} onPress={() => void Haptics.selectionAsync()}>
        <Pressable>{({ pressed }) => content(pressed)}</Pressable>
      </Link>
    );
  }
  if (props.onPress) {
    return (
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          props.onPress?.();
        }}
      >
        {({ pressed }) => content(pressed)}
      </Pressable>
    );
  }
  return content(false);
}

/** Key/value rows like the dashboard's spec sheet: label, then value on the right. */
export function SpecList(props: { children: ReactNode }) {
  return (
    <View style={styles.specList}>
      <Ruled>{props.children}</Ruled>
    </View>
  );
}

export function SpecItem(props: {
  label: string;
  /** Mono for ids, addresses and measured values. */
  mono?: boolean;
  /** The value under the label (long values: address lists, bodies). */
  stacked?: boolean;
  children: ReactNode;
}) {
  const value =
    typeof props.children === "string" ? (
      <Text
        selectable
        style={!props.stacked && styles.specValueText}
        variant={props.mono && props.children !== "—" ? "mono" : "small"}
      >
        {props.children}
      </Text>
    ) : (
      props.children
    );
  if (props.stacked) {
    return (
      <View style={styles.specStacked}>
        <Text muted variant="small">
          {props.label}
        </Text>
        {value}
      </View>
    );
  }
  return (
    <View style={styles.spec}>
      <Text muted variant="small">
        {props.label}
      </Text>
      <View style={styles.specGap} />
      <View style={styles.specValue}>{value}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.tray,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerText: { flex: 1, gap: space.xxs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: -StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardTop: {
    marginTop: -StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.frame,
    borderTopRightRadius: radius.frame,
  },
  cardBottom: {
    marginBottom: -StyleSheet.hairlineWidth,
    borderBottomLeftRadius: radius.frame,
    borderBottomRightRadius: radius.frame,
  },
  footer: { paddingHorizontal: space.lg, paddingVertical: space.md },
  body: { padding: space.lg },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 50,
  },
  rowPressed: { backgroundColor: colors.muted },
  rowText: { flex: 1, gap: space.xxs },
  rowLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowFill: { flex: 1 },
  rowDetail: { flexShrink: 1, maxWidth: "50%" },
  specList: { paddingHorizontal: space.lg },
  spec: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: space.md },
  specValue: { flexShrink: 1, alignItems: "flex-end" },
  specValueText: { textAlign: "right" },
  specStacked: { gap: 6, paddingVertical: space.md },
  specGap: { flex: 1, minWidth: 16 },
});
