import type { LucideIcon } from "lucide-react-native";
import { type ReactNode, useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { type ProductTone, space, usePalette } from "../lib/theme";
import { Button } from "./button";
import { EmptyState } from "./empty";
import { Panel, Ruled } from "./panel";
import { useEndReached } from "./screen";
import { Skeleton } from "./skeleton";

type PagedQuery = {
  isPending: boolean;
  isError: boolean;
  isFetchNextPageError?: boolean;
  error: Error | null;
  data?: unknown;
  refetch: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

/** A `Panel` of ruled rows from a cursor-paged query: the next page loads as the end comes near. */
export function PagedPanel<T>(props: {
  query: PagedQuery;
  items: T[];
  render: (item: T) => ReactNode;
  empty: { icon: LucideIcon; title: string; description?: string; tone?: ProductTone };
  title?: string;
  description?: string;
  meta?: string;
}) {
  const { query } = props;
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  const palette = usePalette();
  const blocked = !hasNextPage || isFetchingNextPage || isFetchNextPageError;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  useEndReached(blocked ? null : loadMore);
  return (
    <Panel
      description={props.description}
      footer={
        isFetchNextPageError ? (
          <Button onPress={loadMore} size="sm" title="Try again" variant="outline" />
        ) : undefined
      }
      meta={props.meta}
      title={props.title}
    >
      {query.isPending ? (
        <RowsSkeleton />
      ) : query.isError && !query.data ? (
        <EmptyState
          action={
            <Button
              onPress={() => void query.refetch()}
              size="sm"
              title="Try again"
              variant="outline"
            />
          }
          description={query.error?.message}
          icon={props.empty.icon}
          title="Couldn't load this"
        />
      ) : props.items.length === 0 ? (
        <EmptyState {...props.empty} />
      ) : (
        <>
          <Ruled>{props.items.map(props.render)}</Ruled>
          {isFetchingNextPage ? (
            <View style={styles.next}>
              <ActivityIndicator color={palette.mutedForeground} />
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function RowsSkeleton() {
  return (
    <Ruled>
      {["a", "b", "c", "d", "e", "f"].map((key, index) => (
        <View key={key} style={styles.row}>
          <View style={styles.rowText}>
            <Skeleton height={13} width={index % 2 ? "52%" : "68%"} />
            <Skeleton height={10} width={index % 2 ? "74%" : "44%"} />
          </View>
          <Skeleton height={10} width={44} />
        </View>
      ))}
    </Ruled>
  );
}

const styles = StyleSheet.create({
  next: { paddingVertical: space.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 58,
  },
  rowText: { flex: 1, gap: 7 },
});
