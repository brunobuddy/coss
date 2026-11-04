// First: crashes during the other modules' setup are reported too.
import "../lib/monitoring";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import {
  DarkTheme,
  DefaultTheme,
  type ErrorBoundaryProps,
  type Href,
  router,
  Stack,
  ThemeProvider,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { TriangleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/button";
import { EmptyState } from "../components/empty";
import { AuthProvider, useAuth } from "../lib/auth";
import { reportError, wrapRoot } from "../lib/monitoring";
import { routeFromNotification } from "../lib/push-route";
import { colors, space } from "../lib/theme";

// React Native has no window focus: refetch what's on screen when the app comes back.
focusManager.setEventListener((onFocus) => {
  const subscription = AppState.addEventListener("change", (state) => onFocus(state === "active"));
  return () => subscription.remove();
});

function RootLayout() {
  // Going back or switching tabs shouldn't refetch what was just read.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider queryClient={queryClient}>
            <StatusBar style="auto" />
            <RootStack />
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);

/** A render crash anywhere below the root: reported, with a way to try again. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error), [error]);
  return (
    <SafeAreaView style={styles.fallback}>
      <EmptyState
        action={
          <Button onPress={() => void retry()} size="sm" title="Try again" variant="outline" />
        }
        description="The app ran into an unexpected problem. Try again, or close and reopen it."
        icon={TriangleAlert}
        title="Something went wrong"
      />
    </SafeAreaView>
  );
}

function RootStack() {
  const { status } = useAuth();
  useNotificationTaps(status === "signed_in");
  if (status === "loading") return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
    >
      <Stack.Protected guard={status === "signed_in"}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signed_out"}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

/** Opens the page a tapped notification points at, including the one that launched the app. */
function useNotificationTaps(signedIn: boolean) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!signedIn || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    Notifications.clearLastNotificationResponse();
    const path = routeFromNotification(response.notification.request.content.data);
    if (path) router.push(path as Href);
  }, [signedIn, response]);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fallback: {
    flex: 1,
    justifyContent: "center",
    padding: space.lg,
    backgroundColor: colors.background,
  },
});
