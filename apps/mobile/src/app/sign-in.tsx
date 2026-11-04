import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Alert } from "../components/alert";
import { Button } from "../components/button";
import { DraftingGrid } from "../components/empty";
import { Text } from "../components/text";
import { type SignInResult, useAuth } from "../lib/auth";
import { colors, fonts, radius, space } from "../lib/theme";

// The dashboard's sign-in panel (apps/web/src/components/auth-frame.tsx): real SDK methods.
const PARTS = [
  { call: "coss.email.send()", label: "Email" },
  { call: "coss.risk.assess()", label: "Risk" },
  { call: "coss.webhookEndpoints.create()", label: "Webhooks" },
];

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setPending(true);
    setError(null);
    const result = await signIn().catch(
      (): SignInResult => ({ ok: false, message: "Something went wrong. Try again." }),
    );
    if (result.ok) {
      // Start at the organizations, not wherever the last session left off.
      router.replace("/");
      return;
    }
    setError(result.message);
    setPending(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.wordmark}>coss.com</Text>

      <View style={styles.panel}>
        <DraftingGrid />
        <Text style={styles.headline}>The foundation the world's apps are built{"\u00a0"}on.</Text>
        <View style={styles.parts}>
          <Text muted variant="body">
            Email, risk and more behind one SDK and one API key.
          </Text>
          <View style={styles.list}>
            {PARTS.map((part, index) => (
              <View key={part.call} style={styles.part}>
                <Text muted variant="mono">
                  {String(index + 1).padStart(2, "0")}
                </Text>
                <Text variant="small">{part.label}</Text>
                <View style={styles.gap} />
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={1}
                  style={styles.call}
                  variant="mono"
                >
                  {part.call}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.form}>
        <View style={styles.heading}>
          <Text variant="title">Sign in</Text>
          <Text muted variant="body">
            Continue on coss.com with your password, a passkey, Google, GitHub or single sign-on.
          </Text>
        </View>
        {error ? <Alert description={error} title="Couldn't sign in" tone="error" /> : null}
        <Button
          loading={pending}
          onPress={onPress}
          title="Continue with coss.com"
          trailingIcon={ArrowRight}
        />
        <Text muted style={styles.legal} variant="small">
          © Cal.com, Inc.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: space.lg,
    gap: space.xl,
  },
  wordmark: {
    fontFamily: fonts.wordmark,
    fontSize: 22,
    color: colors.foreground,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
  },
  panel: {
    flex: 1,
    justifyContent: "space-between",
    borderRadius: radius.frame,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.sidebar,
    padding: space.xxl,
    overflow: "hidden",
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 35,
    letterSpacing: -1.1,
    color: colors.foreground,
  },
  parts: { gap: space.lg },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  part: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  gap: { flex: 1 },
  call: { fontSize: 12, flexShrink: 1, textAlign: "right" },
  form: { gap: space.lg, paddingHorizontal: space.sm, paddingBottom: space.sm },
  heading: { gap: 6 },
  legal: { textAlign: "center", fontSize: 12 },
});
