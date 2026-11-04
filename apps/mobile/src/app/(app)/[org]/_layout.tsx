import { useLocalSearchParams } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { ActiveEnvironmentProvider } from "../../../lib/active-environment";
import { usePalette } from "../../../lib/theme";

export default function OrganizationTabs() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const palette = usePalette();
  return (
    <ActiveEnvironmentProvider org={org}>
      <NativeTabs minimizeBehavior="onScrollDown" tintColor={palette.foreground}>
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(products)">
          <NativeTabs.Trigger.Icon
            sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          />
          <NativeTabs.Trigger.Label>Products</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(organization)">
          <NativeTabs.Trigger.Icon sf={{ default: "building.2", selected: "building.2.fill" }} />
          <NativeTabs.Trigger.Label>Organization</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ActiveEnvironmentProvider>
  );
}
