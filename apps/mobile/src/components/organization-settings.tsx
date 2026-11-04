import * as Haptics from "expo-haptics";
import { type Href, Link } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, space } from "../lib/theme";
import { Icon } from "./icon";
import { Text } from "./text";

/**
 * The dashboard's `SettingsRow` (apps/web/src/components/settings.tsx) for the organization
 * settings screens: a label with its value on the right, a description under them, and a chevron
 * when it opens another screen.
 */
export function SettingsRow(props: {
  label: string;
  description?: string;
  /** Right of the label: a status, a mono value. */
  value?: ReactNode;
  /** Under the label instead (long values: URLs, ids). */
  stacked?: ReactNode;
  href?: Href;
}) {
  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.pressed]}>
      <View style={styles.text}>
        <View style={styles.head}>
          <Text style={styles.label} variant="label">
            {props.label}
          </Text>
          {props.value ? <View style={styles.headValue}>{props.value}</View> : null}
        </View>
        {props.stacked}
        {props.description ? (
          <Text muted variant="small">
            {props.description}
          </Text>
        ) : null}
      </View>
      {props.href ? <Icon color="mutedForeground" icon={ChevronRight} size={16} /> : null}
    </View>
  );
  if (!props.href) return content(false);
  return (
    <Link asChild href={props.href} onPress={() => void Haptics.selectionAsync()}>
      <Pressable>{({ pressed }) => content(pressed)}</Pressable>
    </Link>
  );
}

/** A selectable mono value on its own line (a URL to copy into an identity provider). */
export function SettingsValue(props: { children: string }) {
  return (
    <View style={styles.value}>
      <Text selectable variant="mono">
        {props.children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.muted },
  text: { flex: 1, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { flex: 1 },
  headValue: { flexShrink: 1, maxWidth: "60%", alignItems: "flex-end" },
  value: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: space.sm,
  },
});
