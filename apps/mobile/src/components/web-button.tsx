import { Stack } from "expo-router";
import { openOnWeb } from "../lib/web";

/** A native bar button that opens the same page on coss.com. */
export function WebButton({ path }: { path: string }) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        accessibilityLabel="Open on coss.com"
        icon="safari"
        onPress={() => openOnWeb(path)}
      />
    </Stack.Toolbar>
  );
}
