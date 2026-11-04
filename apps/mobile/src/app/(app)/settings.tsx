import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { LogOut, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert as NativeAlert, Pressable, StyleSheet, View } from "react-native";
import { UserAvatar } from "../../components/avatar";
import { Badge } from "../../components/badge";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { ListRow, Panel, SpecItem, SpecList } from "../../components/panel";
import { PushSettingsPanel } from "../../components/push-settings";
import { Screen } from "../../components/screen";
import { Text } from "../../components/text";
import { useAuth } from "../../lib/auth";
import { DASHBOARD_URL } from "../../lib/config";
import { useMe } from "../../lib/queries";
import { space } from "../../lib/theme";

export default function SettingsScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  if (me.isPending) return <Screen loading="list" />;
  if (me.isError && !me.data) return <Screen error={me.error} onRetry={() => me.refetch()} />;
  const { user } = me.data;

  const confirmSignOut = () =>
    NativeAlert.alert("Sign out of coss.com?", "You can sign in again at any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          setSigningOut(true);
          void signOut();
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable hitSlop={8} onPress={() => router.back()} style={styles.done}>
              <Text variant="label">Done</Text>
            </Pressable>
          ),
        }}
      />
      <Screen>
        <View style={styles.profile}>
          <UserAvatar name={user.name} size={64} />
          <Text variant="title">{user.name}</Text>
          <Text muted variant="mono">
            {user.email}
          </Text>
        </View>
        <Panel title="Account">
          <SpecList>
            <SpecItem label="Name">{user.name}</SpecItem>
            <SpecItem label="Email">{user.email}</SpecItem>
            <SpecItem label="Two-factor authentication">
              {user.two_factor_enabled ? (
                <Badge variant="success">On</Badge>
              ) : (
                <Badge variant="outline">Off</Badge>
              )}
            </SpecItem>
          </SpecList>
        </Panel>
        <PushSettingsPanel />
        <Panel
          footer="This device's session is listed on coss.com under Settings → Sessions, where you can revoke it."
          title="This device"
        >
          <SpecList>
            <SpecItem label="Dashboard" mono>
              {DASHBOARD_URL.replace(/^https?:\/\//, "")}
            </SpecItem>
            <SpecItem label="Version" mono>
              {Constants.expoConfig?.version ?? "—"}
            </SpecItem>
          </SpecList>
        </Panel>
        <Button
          icon={LogOut}
          loading={signingOut}
          onPress={confirmSignOut}
          title="Sign out"
          variant="destructive-outline"
        />
        <Panel>
          <ListRow
            href="/delete-account"
            leading={<Icon color="destructiveForeground" icon={Trash2} size={18} />}
            subtitle="Permanently delete your coss.com account"
            title="Delete account"
          />
        </Panel>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: "center", gap: 6, paddingVertical: space.md },
  done: { paddingHorizontal: 6 },
});
