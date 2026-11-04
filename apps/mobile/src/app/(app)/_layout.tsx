import { Stack } from "expo-router";
import { stackOptions } from "../../lib/navigation";
import { usePalette } from "../../lib/theme";

export const unstable_settings = { anchor: "index" };

export default function AppLayout() {
  const palette = usePalette();
  return (
    <Stack screenOptions={stackOptions(palette)}>
      <Stack.Screen name="[org]" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="organizations" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings" options={{ title: "Account", presentation: "modal" }} />
      <Stack.Screen
        name="delete-account"
        options={{ title: "Delete account", presentation: "modal" }}
      />
    </Stack>
  );
}
