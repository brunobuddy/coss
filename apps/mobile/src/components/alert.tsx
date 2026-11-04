import * as Haptics from "expo-haptics";
import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, space, TONE_TOKENS, type Tone } from "../lib/theme";
import { Icon } from "./icon";
import { Text } from "./text";

const ICONS: Record<Tone, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  info: Info,
  neutral: Info,
};

/** coss ui's `Alert`: a tinted, bordered note with its icon, title, text and one action. */
export function Alert(props: {
  tone: Tone;
  title?: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}) {
  const tone = TONE_TOKENS[props.tone];
  return (
    <View
      style={[
        styles.alert,
        props.tone !== "neutral" && {
          borderColor: colors[tone.border],
          backgroundColor: colors[tone.tint],
        },
      ]}
    >
      <View style={styles.icon}>
        <Icon
          color={props.tone === "neutral" ? "mutedForeground" : tone.dot}
          icon={ICONS[props.tone]}
          size={16}
          strokeWidth={2}
        />
      </View>
      <View style={styles.text}>
        {props.title ? <Text variant="label">{props.title}</Text> : null}
        {props.description ? (
          <Text muted={Boolean(props.title)} variant="small">
            {props.description}
          </Text>
        ) : null}
        {props.action ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              void Haptics.selectionAsync();
              props.action?.onPress();
            }}
            style={styles.action}
          >
            {({ pressed }) => (
              <Text style={[styles.actionText, pressed && styles.pressed]} variant="smallMedium">
                {props.action?.label} →
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: "row",
    gap: 10,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: space.md,
  },
  icon: { paddingTop: space.xxs },
  text: { flex: 1, gap: space.xxs },
  action: { alignSelf: "flex-start", marginTop: 6 },
  actionText: { textDecorationLine: "underline" },
  pressed: { opacity: 0.6 },
});
