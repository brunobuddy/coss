import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  type ColorToken,
  colors,
  motion,
  radius,
  space,
  useFinish,
  usePalette,
} from "../lib/theme";
import { Icon } from "./icon";
import { Text } from "./text";

type Variant = "default" | "outline" | "ghost" | "destructive-outline";

const FOREGROUND: Record<Variant, ColorToken> = {
  default: "primaryForeground",
  outline: "foreground",
  ghost: "foreground",
  "destructive-outline": "destructiveForeground",
};

/** coss ui's `Button` with the dashboard's finish, at touch size: it gives under the finger. */
export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const variant = props.variant ?? "default";
  const foreground = FOREGROUND[variant];
  const palette = usePalette();
  const finish = useFinish();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const lit =
    variant === "default"
      ? { experimental_backgroundImage: finish.primaryGradient, boxShadow: finish.primaryEdge }
      : variant === "ghost"
        ? null
        : {
            experimental_backgroundImage: finish.keycapGradient,
            boxShadow: finish.keycapEdge,
            borderBottomColor: finish.keycapBottom,
          };
  return (
    <Animated.View style={[pressStyle, props.disabled && styles.disabled]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: props.disabled, busy: props.loading }}
        disabled={props.disabled || props.loading}
        onPress={() => {
          void Haptics.selectionAsync();
          props.onPress();
        }}
        onPressIn={() => {
          if (!reduced) scale.value = withSpring(0.975, motion.spring);
        }}
        onPressOut={() => {
          if (!reduced) scale.value = withSpring(1, motion.spring);
        }}
        style={({ pressed }) => [
          styles.button,
          props.size === "sm" && styles.small,
          styles[variant],
          lit,
          pressed && (variant === "default" ? styles.pressedSolid : styles.pressed),
        ]}
      >
        {props.loading ? (
          <ActivityIndicator color={palette[foreground]} />
        ) : (
          <View style={styles.content}>
            {props.icon ? <Icon color={foreground} icon={props.icon} strokeWidth={2} /> : null}
            <Text style={{ color: colors[foreground] }} variant="label">
              {props.title}
            </Text>
            {props.trailingIcon ? (
              <Icon color={foreground} icon={props.trailingIcon} strokeWidth={2} />
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 46,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  small: { height: 36, paddingHorizontal: space.md, borderRadius: radius.md },
  content: { flexDirection: "row", alignItems: "center", gap: space.sm },
  default: { backgroundColor: colors.primary, borderColor: colors.primary },
  outline: { backgroundColor: colors.card, borderColor: colors.input },
  ghost: {},
  "destructive-outline": { backgroundColor: colors.card, borderColor: colors.input },
  pressed: { backgroundColor: colors.muted },
  pressedSolid: { opacity: 0.88 },
  disabled: { opacity: 0.64 },
});
