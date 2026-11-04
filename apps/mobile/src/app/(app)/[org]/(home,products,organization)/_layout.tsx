import { Stack } from "expo-router";
import { stackOptions } from "../../../../lib/navigation";
import { usePalette } from "../../../../lib/theme";

export const unstable_settings = { anchor: "index" };

export default function TabStack() {
  const palette = usePalette();
  return <Stack screenOptions={stackOptions(palette)} />;
}
