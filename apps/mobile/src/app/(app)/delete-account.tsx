import type { AccountDeletionOrganization } from "@coss/companion";
import * as Haptics from "expo-haptics";
import { router, Stack } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert as NativeAlert, Pressable, StyleSheet, TextInput } from "react-native";
import { Alert } from "../../components/alert";
import { Button } from "../../components/button";
import { ListRow, Panel, PanelBody, Ruled } from "../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../components/screen";
import { Code, Text } from "../../components/text";
import { useAuth } from "../../lib/auth";
import { ApiRequestError, useAccountDeletion, useDeleteAccount, useMe } from "../../lib/queries";
import { colors, fonts, radius, usePalette } from "../../lib/theme";

// Mirrors the dashboard's account settings (apps/web/src/app/settings/delete-account-button.tsx).
function Organizations(props: { title: string; organizations: AccountDeletionOrganization[] }) {
  if (props.organizations.length === 0) return null;
  return (
    <Panel title={props.title}>
      <Ruled>
        {props.organizations.map((organization) => (
          <ListRow detail={organization.slug} key={organization.slug} title={organization.name} />
        ))}
      </Ruled>
    </Panel>
  );
}

export default function DeleteAccountScreen() {
  const me = useMe();
  const plan = useAccountDeletion();
  const remove = useDeleteAccount();
  const { signOut } = useAuth();
  const palette = usePalette();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (plan.isPending || me.isPending) return <Loading />;
  if (plan.isError && !plan.data) {
    return <ErrorState error={plan.error} onRetry={() => plan.refetch()} />;
  }
  if (me.isError && !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  const { email } = me.data.user;
  const blocked = plan.data.blockers.length > 0;
  const confirmed = confirmation.trim().toLowerCase() === email.toLowerCase();

  const submit = () => {
    setError(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    remove.mutate(confirmation, {
      onSuccess: async () => {
        // The session went with the account: this only clears it from the device.
        await signOut();
        NativeAlert.alert("Your account was deleted");
      },
      onError: (failure) => {
        if (
          failure instanceof ApiRequestError &&
          failure.error.code === "reauthentication_required"
        ) {
          NativeAlert.alert("Sign in again", failure.message, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign in again", onPress: () => void signOut() },
          ]);
          return;
        }
        setError(failure.message);
      },
    });
  };

  return (
    <Screen onRefresh={() => plan.refetch()} title="Delete account">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable hitSlop={8} onPress={() => router.back()} style={styles.cancel}>
              <Text variant="label">Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <PageIntro
        description="You're signed out everywhere, your personal API keys stop working and your profile, passkeys and connected accounts are deleted. This can't be undone."
        title="Delete account"
      />
      {blocked ? (
        <Alert
          description={plan.data.blockers.join(" ")}
          title="Your account can't be deleted yet"
          tone="warning"
        />
      ) : null}
      <Organizations
        organizations={plan.data.delete_organizations}
        title="Deleted with your account, phone numbers included"
      />
      <Organizations organizations={plan.data.leave_organizations} title="You leave" />
      {blocked ? null : (
        <Panel title="Confirm">
          <PanelBody>
            <Text muted variant="small">
              Type <Code>{email}</Code> to confirm.
            </Text>
            <TextInput
              accessibilityLabel="Your email address"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setConfirmation}
              placeholder="Email address"
              placeholderTextColor={palette.mutedForeground}
              spellCheck={false}
              style={styles.input}
              value={confirmation}
            />
            {error ? <Alert description={error} tone="error" /> : null}
            <Button
              disabled={!confirmed}
              icon={Trash2}
              loading={remove.isPending}
              onPress={submit}
              title="Delete account"
              variant="destructive-outline"
            />
          </PanelBody>
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cancel: { paddingHorizontal: 6 },
  input: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.input,
    backgroundColor: colors.background,
    color: colors.foreground,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
});
