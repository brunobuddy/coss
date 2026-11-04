import { Search, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, fonts, radius, space, usePalette } from "../lib/theme";
import { Icon } from "./icon";

/** coss ui's `Input` with a search icon; submits on return, clears with the × button. */
export function SearchField(props: {
  placeholder: string;
  value: string;
  onSubmit: (value: string) => void;
  mono?: boolean;
  keyboardType?: "default" | "email-address";
}) {
  const [draft, setDraft] = useState(props.value);
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Icon color="mutedForeground" icon={Search} size={16} />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboardType}
        onChangeText={setDraft}
        onSubmitEditing={() => props.onSubmit(draft.trim())}
        placeholder={props.placeholder}
        placeholderTextColor={palette.mutedForeground}
        returnKeyType="search"
        style={[styles.input, { fontFamily: props.mono ? fonts.mono : fonts.regular }]}
        value={draft}
      />
      {draft ? (
        <Pressable
          accessibilityLabel="Clear"
          hitSlop={8}
          onPress={() => {
            setDraft("");
            props.onSubmit("");
          }}
        >
          <Icon color="mutedForeground" icon={X} size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.input,
    backgroundColor: colors.background,
  },
  input: { flex: 1, fontSize: 15, color: colors.foreground, height: "100%" },
});
