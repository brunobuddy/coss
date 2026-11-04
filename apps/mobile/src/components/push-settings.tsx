import type { PushCategory } from "@coss/companion";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Settings } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, View } from "react-native";
import { useAuth } from "../lib/auth";
import { enablePush, type PushPermission, pushPermission } from "../lib/push";
import { usePushSettings, useUpdatePushCategories } from "../lib/queries";
import { colors, space, usePalette } from "../lib/theme";
import { Alert } from "./alert";
import { Button } from "./button";
import { Panel, PanelBody, Ruled } from "./panel";
import { Text } from "./text";

const CATEGORIES: { key: PushCategory; title: string; description: string }[] = [
  {
    key: "reputation",
    title: "Account standing",
    description: "Warnings and suspensions of an organization's sending.",
  },
  { key: "billing", title: "Billing", description: "Failed payments and holds on live sending." },
  {
    key: "endpoints",
    title: "Disabled endpoints",
    description: "Webhook endpoints, Hooks endpoints and log drains turned off after failing.",
  },
  {
    key: "risk_reviews",
    title: "Risk reviews",
    description: "Assessments waiting for review in live environments.",
  },
];

/** iOS permission, re-read when the app comes back (e.g. from Settings) or asks again. */
function usePushPermission(): [PushPermission | null, () => void] {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useEffect(() => {
    const read = () => void pushPermission().then(setPermission);
    read();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => subscription.remove();
  }, []);
  return [permission, () => void pushPermission().then(setPermission)];
}

export function PushSettingsPanel() {
  const { api } = useAuth();
  const palette = usePalette();
  const queryClient = useQueryClient();
  const [permission, readPermission] = usePushPermission();
  const settings = usePushSettings();
  const update = useUpdatePushCategories();
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turnOn = async () => {
    setEnabling(true);
    setError(null);
    try {
      const result = await enablePush(api);
      if (result?.error) setError(result.error.message);
      else if (result) queryClient.setQueryData(["push"], result.data);
    } catch {
      setError("This device couldn't register for notifications. Try again.");
    } finally {
      setEnabling(false);
      readPermission();
    }
  };

  const footer =
    "Sent for organizations where your role can act on them, while this device is signed in.";
  if (permission === null || settings.isPending) return null;

  if (permission === "denied") {
    return (
      <Panel footer={footer} title="Notifications">
        <PanelBody>
          <Text muted variant="small">
            Notifications are turned off for coss.com in iOS Settings.
          </Text>
          <Button
            icon={Settings}
            onPress={() => void Linking.openSettings()}
            title="Open Settings"
            variant="outline"
          />
        </PanelBody>
      </Panel>
    );
  }

  const registered = permission === "granted" && settings.data?.registered;
  if (!registered || !settings.data) {
    return (
      <Panel footer={footer} title="Notifications">
        <PanelBody>
          <Text muted variant="small">
            Get a notification when an organization's standing changes, a payment fails, an endpoint
            is disabled or an assessment waits for review.
          </Text>
          {error ? <Alert title={error} tone="error" /> : null}
          <Button
            icon={Bell}
            loading={enabling}
            onPress={() => void turnOn()}
            title="Turn on notifications"
            variant="outline"
          />
        </PanelBody>
      </Panel>
    );
  }

  const categories = settings.data.categories;
  return (
    <Panel footer={footer} title="Notifications">
      <Ruled>
        {CATEGORIES.map((category) => (
          <View key={category.key} style={styles.row}>
            <View style={styles.text}>
              <Text variant="label">{category.title}</Text>
              <Text muted variant="small">
                {category.description}
              </Text>
            </View>
            <Switch
              accessibilityLabel={category.title}
              onValueChange={(value) => update.mutate({ ...categories, [category.key]: value })}
              thumbColor={categories[category.key] ? palette.primaryForeground : undefined}
              trackColor={{ true: colors.primary }}
              value={categories[category.key]}
            />
          </View>
        ))}
      </Ruled>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: space.md, padding: 14 },
  text: { flex: 1, gap: space.xxs },
});
