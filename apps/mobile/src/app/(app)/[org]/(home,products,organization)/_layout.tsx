import { Stack } from "expo-router";
import { stackOptions } from "../../../../lib/navigation";
import { usePalette } from "../../../../lib/theme";

export const unstable_settings = { anchor: "index" };

export default function TabStack() {
  const palette = usePalette();
  return (
    <Stack screenOptions={stackOptions(palette)}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="projects/[project]/[env]/scheduling/bookings/[bookingId]"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.72, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
        }}
      />
    </Stack>
  );
}
