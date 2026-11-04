import { StyleSheet, View } from "react-native";
import { colors, fonts, radius } from "../lib/theme";
import { Text } from "./text";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0]}${words[1]?.[0]}` : (words[0] ?? "?").slice(0, 1);
  return letters.toUpperCase();
}

/** The sidebar's organization mark: initials on a dark tile. */
export function OrgAvatar(props: { name: string; size?: number }) {
  const size = props.size ?? 32;
  return (
    <View
      style={[
        styles.org,
        { width: size, height: size, borderRadius: size > 36 ? radius.lg : radius.md },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.42, lineHeight: size * 0.5 }]}>
        {initials(props.name)}
      </Text>
    </View>
  );
}

/** The user menu's avatar: initials in a circle. */
export function UserAvatar(props: { name: string; size?: number }) {
  const size = props.size ?? 32;
  return (
    <View style={[styles.user, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.42, lineHeight: size * 0.5 }]}>
        {initials(props.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  org: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  user: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  initials: { fontFamily: fonts.medium, color: colors.primaryForeground },
  person: {
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  personInitials: { fontFamily: fonts.medium, color: colors.mutedForeground },
});

/** A person who isn't the signed-in user: initials on the muted tray. */
export function Avatar(props: { name: string; size?: number }) {
  const size = props.size ?? 32;
  return (
    <View style={[styles.person, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.personInitials, { fontSize: size * 0.38, lineHeight: size * 0.48 }]}>
        {initials(props.name)}
      </Text>
    </View>
  );
}
