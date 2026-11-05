import { useNavigation } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CloudOff, Fingerprint, KeyRound, TriangleAlert } from "lucide-react-native";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type NativeScrollEvent, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useAuth } from "../lib/auth";
import { DASHBOARD_URL } from "../lib/config";
import { ApiRequestError } from "../lib/queries";
import { colors, motion, space, usePalette } from "../lib/theme";
import { Button } from "./button";
import { EmptyState } from "./empty";
import { SkeletonPage, type SkeletonShape } from "./skeleton";
import { Text } from "./text";

/** Past this offset the page title has scrolled under the bar, which then shows it. */
const TITLE_SCROLLED = 44;
const LARGE_TITLE_LENGTH = 20;
/** How close to the end of the content, in points, a list asks for its next page. */
const END_REACHED = 600;

type ScreenContextValue = {
  /** Native large title: a `PageIntro` with the same title doesn't draw it again. */
  largeTitle: string | undefined;
  /** This content replaced a skeleton: figures may count up and charts may draw once. */
  arrived: boolean;
  onEndReached: (handler: (() => void) | null) => void;
};

const ScreenContext = createContext<ScreenContextValue>({
  largeTitle: undefined,
  arrived: false,
  onEndReached: () => {},
});

/** Whether the content on screen just replaced a skeleton (never true on a cached paint). */
export function useArrival(): boolean {
  return use(ScreenContext).arrived;
}

/** Calls `handler` whenever the screen scrolls near its end. */
export function useEndReached(handler: (() => void) | null) {
  const { onEndReached } = use(ScreenContext);
  useEffect(() => {
    onEndReached(handler);
    return () => onEndReached(null);
  }, [onEndReached, handler]);
}

/**
 * A page. Every state of a route (loading, failed, loaded) renders a `Screen`, so React keeps one
 * native scroll view for the screen's whole life: UIKit needs that for large titles and for the
 * bars' scroll edge, and the title shows from the first frame.
 */
export function Screen(props: {
  children?: ReactNode;
  /** The page title. Short titles known from the first frame become native large titles. */
  title?: string;
  /** Pull to refresh; the spinner shows until the returned promise settles. */
  onRefresh?: () => unknown;
  /** Draws a skeleton of this shape instead of the children. */
  loading?: SkeletonShape;
  /** Draws this failure, with the way out of an organization's SSO or two-factor requirement. */
  error?: Error | null;
  onRetry?: () => void;
}) {
  const palette = usePalette();
  const navigation = useNavigation();
  const [scrolled, setScrolled] = useState(false);
  // Only a pull shows the spinner: background refetches (revisits, invalidations) stay silent.
  const [refreshing, setRefreshing] = useState(false);
  const { title, onRefresh, loading, error, onRetry } = props;
  const [large] = useState(() => title !== undefined && title.length <= LARGE_TITLE_LENGTH);
  const phase = loading ? "loading" : error ? "error" : "content";
  const hadSkeleton = useRef(phase === "loading");
  const arrived = phase === "content" && hadSkeleton.current;

  useLayoutEffect(() => {
    if (title === undefined) return;
    navigation.setOptions(
      large ? { title, headerLargeTitle: true } : { title: scrolled ? title : "" },
    );
  }, [navigation, title, large, scrolled]);

  const endHandler = useRef<(() => void) | null>(null);
  const metrics = useRef({ offset: 0, viewport: 0, content: 0 });
  const checkEnd = useCallback(() => {
    const { offset, viewport, content } = metrics.current;
    if (content > 0 && offset + viewport >= content - END_REACHED) endHandler.current?.();
  }, []);
  const context = useMemo<ScreenContextValue>(
    () => ({
      largeTitle: large ? title : undefined,
      arrived,
      onEndReached: (handler) => {
        endHandler.current = handler;
        if (handler) checkEnd();
      },
    }),
    [large, title, arrived, checkEnd],
  );

  const onScroll = (event: { nativeEvent: NativeScrollEvent }) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    metrics.current = {
      offset: contentOffset.y,
      viewport: layoutMeasurement.height,
      content: contentSize.height,
    };
    checkEnd();
    if (!large) setScrolled(contentOffset.y > TITLE_SCROLLED);
  };

  return (
    <ScreenContext value={context}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={(_, height) => {
          metrics.current.content = height;
          checkEnd();
        }}
        onLayout={(event) => {
          metrics.current.viewport = event.nativeEvent.layout.height;
          checkEnd();
        }}
        onScroll={onScroll}
        refreshControl={
          onRefresh && phase !== "loading" ? (
            <RefreshControl
              onRefresh={() => {
                setRefreshing(true);
                void Promise.resolve(onRefresh())
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
              refreshing={refreshing}
              tintColor={palette.mutedForeground}
            />
          ) : undefined
        }
        scrollEventThrottle={32}
        style={styles.screen}
      >
        {phase === "loading" && loading ? (
          <SkeletonPage shape={loading} />
        ) : phase === "error" && error ? (
          <ErrorContent error={error} onRetry={onRetry ?? (() => {})} />
        ) : arrived ? (
          <Animated.View entering={FadeIn.duration(motion.arrive)} style={styles.column}>
            {props.children}
          </Animated.View>
        ) : (
          <View style={styles.column}>{props.children}</View>
        )}
      </ScrollView>
    </ScreenContext>
  );
}

/** The dashboard's `PageHeader`: the title in the display face, a description and a meta line. */
export function PageIntro(props: {
  title?: string;
  /** The title in mono (a URL, an id), like the dashboard's endpoint pages. */
  mono?: boolean;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  const { largeTitle } = use(ScreenContext);
  const title = props.title && props.title !== largeTitle ? props.title : null;
  if (!title && !props.description && !props.meta) return null;
  return (
    <View style={styles.intro}>
      {title ? (
        <Text
          selectable
          style={props.mono && styles.monoTitle}
          variant={props.mono ? "mono" : "title"}
        >
          {title}
        </Text>
      ) : null}
      {props.description ? (
        <Text muted variant="body">
          {props.description}
        </Text>
      ) : null}
      {props.meta ? <View style={styles.meta}>{props.meta}</View> : null}
    </View>
  );
}

function ErrorContent({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { signOut } = useAuth();
  const apiError = error instanceof ApiRequestError ? error.error : null;
  const url = apiError?.url;
  const view =
    apiError?.code === "two_factor_required" && url
      ? {
          icon: Fingerprint,
          title: "Two-factor authentication required",
          action: (
            <Button
              onPress={() => void WebBrowser.openBrowserAsync(`${DASHBOARD_URL}${url}`)}
              title="Set it up on coss.com"
              variant="outline"
            />
          ),
        }
      : apiError?.code === "sso_required"
        ? {
            icon: KeyRound,
            title: "Single sign-on required",
            action: (
              <Button
                onPress={() => void signOut()}
                title="Sign in again with SSO"
                variant="outline"
              />
            ),
          }
        : {
            icon: apiError?.code === "network_error" ? CloudOff : TriangleAlert,
            title: apiError?.code === "network_error" ? "You're offline" : "Couldn't load this",
            action: <Button onPress={onRetry} size="sm" title="Try again" variant="outline" />,
          };
  return (
    <EmptyState
      action={view.action}
      description={error.message}
      icon={view.icon}
      title={view.title}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 112 },
  column: { gap: space.xl },
  intro: { gap: space.sm },
  monoTitle: { fontSize: 19, lineHeight: 26 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
});
