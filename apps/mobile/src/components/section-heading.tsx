import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { space } from "../lib/theme";
import { Text } from "./text";

/** The dashboard's `SectionHeading`: a heading above a block that carries its own frame. */
export function SectionHeading(props: { title: string; action?: ReactNode; detail?: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title} variant="heading">
        {props.title}
      </Text>
      {props.detail ? (
        <Text muted variant="mono">
          {props.detail}
        </Text>
      ) : null}
      {props.action}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 24,
    marginBottom: space.sm,
    paddingHorizontal: space.xxs,
  },
  title: { flex: 1 },
});
