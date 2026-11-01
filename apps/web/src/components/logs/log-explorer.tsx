"use client";

import type { LogFacets, LogHistogram } from "@coss/logs";
import { parseLogQuery } from "@coss/logs/query";
import type { LogEntryOutput, LogListOutput } from "@coss/logs/schemas";
import { Button } from "@coss/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@coss/ui/components/empty";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@coss/ui/components/menu";
import { Spinner } from "@coss/ui/components/spinner";
import { Toggle } from "@coss/ui/components/toggle";
import { DownloadIcon, PauseIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  compactCount,
  formatDuration,
  LEVEL_DOT,
  LEVEL_LABEL,
  logTimeParts,
  statusClassName,
} from "./format";
import { LogDetailSheet } from "./log-detail";
import { LogFilterSidebar } from "./log-filters";
import { LogHistogramChart } from "./log-histogram";
import { LogSearch } from "./log-search";
import { type ExplorerView, type ListField, toggleFilter, viewSearch } from "./url";

const LIVE_POLL_MS = 2000;
/** Facets and the histogram refresh less often than the list while live. */
const LIVE_REFRESH_MS = 15_000;
/** Lines kept on screen while live (older ones are dropped). */
const LIVE_MAX_LINES = 1000;
/** How far behind the newest line each live poll re-reads (request lines are written ~1 s late). */
const LIVE_OVERLAP_MS = 60_000;

/** Newest first by `(occurred_at, id)`, the order the server pages in. */
function newestFirst(a: LogEntryOutput, b: LogEntryOutput): number {
  if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export type LogExplorerProps = {
  view: ExplorerView;
  page: LogListOutput;
  histogram: LogHistogram;
  facets: LogFacets;
  apiKeyNames: Record<string, string>;
  /** `/<org>/projects/<project>/<env>` */
  envPath: string;
  /** The line the URL opens (`?log=`). */
  selected: string | null;
};

function Row(props: {
  entry: LogEntryOutput;
  selected: boolean;
  fresh: boolean;
  onOpen: () => void;
}) {
  const { entry } = props;
  const { day, time, fraction } = logTimeParts(entry.occurred_at);
  return (
    <tr
      aria-selected={props.selected}
      className={`group cursor-pointer border-b border-border/60 font-mono text-[13px] transition-colors hover:bg-accent/50 aria-selected:bg-accent ${props.fresh ? "bg-info/8" : ""}`}
      data-log-id={entry.id}
      onClick={props.onOpen}
    >
      <td className="whitespace-nowrap py-1.5 ps-3 pe-4">
        <span className="flex items-center gap-2.5">
          <span
            className={`size-2 shrink-0 rounded-full ${LEVEL_DOT[entry.level]}`}
            title={LEVEL_LABEL[entry.level]}
          />
          <span className="text-muted-foreground">{day}</span>
          <span>
            {time}
            <span className="text-muted-foreground">{fraction}</span>
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap py-1.5 pe-4">
        {entry.source === "api" ? (
          <span className="flex gap-2">
            <span className="w-11 text-muted-foreground">{entry.method}</span>
            <span className={statusClassName(entry.status_code)}>{entry.status_code}</span>
          </span>
        ) : entry.source === "webhook" ? (
          <span className="flex gap-2">
            <span className="w-11 text-muted-foreground">HOOK</span>
            <span className={statusClassName(entry.status_code)}>{entry.status_code ?? "—"}</span>
          </span>
        ) : entry.source === "smtp" ? (
          // SMTP reply codes share HTTP's classes (2xx accepted, 4xx retry, 5xx refused).
          <span className="flex gap-2">
            <span className="w-11 text-muted-foreground">SMTP</span>
            <span className={statusClassName(entry.status_code)}>{entry.status_code ?? "—"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{entry.type.replace(/^(email|sms)\./, "")}</span>
        )}
      </td>
      <td className="max-w-0 py-1.5 pe-4">
        <span className="block truncate">
          {entry.source === "api" ? (
            <>
              {entry.path}
              {entry.error_code ? (
                <span className="ms-3 text-muted-foreground">{entry.error_code}</span>
              ) : null}
            </>
          ) : (
            entry.message
          )}
        </span>
      </td>
      <td className="hidden max-w-0 py-1.5 pe-4 text-muted-foreground lg:table-cell">
        <span className="block truncate">{entry.recipient ?? entry.resource_id ?? ""}</span>
      </td>
      <td className="whitespace-nowrap py-1.5 pe-3 text-right text-muted-foreground tabular-nums">
        {formatDuration(entry.duration_ms)}
      </td>
    </tr>
  );
}

/**
 * The environment's log explorer: filters and time range in the URL (shareable), a histogram,
 * newest-first lines with infinite "load older", live tail, a detail drawer and export.
 */
export function LogExplorer(props: LogExplorerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { view } = props;
  const logsPath = `${props.envPath}/developers/logs`;
  const filters = useMemo(() => parseLogQuery(view.q), [view.q]);

  const [entries, setEntries] = useState(props.page.data);
  const [hasMore, setHasMore] = useState(props.page.has_more);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(props.selected);
  const [cursor, setCursor] = useState<number>(-1);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  // Relative ranges move on refresh; their preset, not their resolved dates, identifies the view.
  const viewKey = `${logsPath}?${viewSearch(view)}`;
  const previousView = useRef(viewKey);
  const newestRef = useRef<string | undefined>(entries[0]?.occurred_at);
  newestRef.current = entries[0]?.occurred_at;
  // Preserve live rows only for refreshes of the same view.
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    const changed = previousView.current !== viewKey;
    previousView.current = viewKey;
    if (liveRef.current && !changed) return;
    newestRef.current = props.page.data[0]?.occurred_at;
    setFresh(new Set());
    setLoadingMore(false);
    setEntries(props.page.data);
    setHasMore(props.page.has_more);
    setCursor(-1);
    if (!view.preset) setLive(false);
  }, [props.page, viewKey, view.preset]);

  const navigate = useCallback(
    (next: Partial<ExplorerView>) => {
      const merged = { ...view, ...next };
      startTransition(() => router.push(`${logsPath}?${viewSearch(merged)}`, { scroll: false }));
    },
    [logsPath, router, view],
  );

  const setQuery = useCallback((q: string) => navigate({ q }), [navigate]);

  // Keep `?log=` in the URL without a server round trip, so a line can be linked to.
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      const url = `${logsPath}?${viewSearch(view, { log: id ?? undefined })}`;
      window.history.replaceState(window.history.state, "", url);
    },
    [logsPath, view],
  );

  async function loadOlder() {
    const last = entries.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const search = viewSearch({ ...view, preset: null }, { after: last.id });
      const response = await fetch(`${logsPath}/feed?${search}`);
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as LogListOutput;
      if (previousView.current !== viewKey) return;
      setEntries((current) => [...current, ...page.data]);
      setHasMore(page.has_more);
    } catch (error) {
      console.error("[logs] loading older lines failed:", error);
    } finally {
      if (previousView.current === viewKey) setLoadingMore(false);
    }
  }

  // Live tail: poll a window behind the newest line shown (late writes land there too) and merge
  // by id.
  useEffect(() => {
    if (!live || !view.preset) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let lastRefresh = Date.now();
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const search = new URLSearchParams({ live: "1" });
          if (view.q.trim()) search.set("q", view.q.trim());
          if (newestRef.current) {
            const since = Date.parse(newestRef.current) - LIVE_OVERLAP_MS;
            search.set("since", new Date(since).toISOString());
          }
          const response = await fetch(`${logsPath}/feed?${search}`);
          if (response.ok) {
            const page = (await response.json()) as LogListOutput;
            if (!stopped) {
              setEntries((current) => {
                const known = new Set(current.map((entry) => entry.id));
                const added = page.data.filter((entry) => !known.has(entry.id));
                if (added.length === 0) return current;
                setFresh(new Set(added.map((entry) => entry.id)));
                return [...added, ...current].sort(newestFirst).slice(0, LIVE_MAX_LINES);
              });
            }
          }
        } catch (error) {
          console.error("[logs] live poll failed:", error);
        }
        if (Date.now() - lastRefresh > LIVE_REFRESH_MS) {
          lastRefresh = Date.now();
          startTransition(() => router.refresh());
        }
      }
      if (!stopped) timer = setTimeout(poll, LIVE_POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, logsPath, router, view.q, view.preset]);

  function toggleLive() {
    if (live) {
      setLive(false);
      return;
    }
    // Live follows "now": switch an absolute range to the default relative one.
    if (!view.preset) navigate({ preset: "1h" });
    setLive(true);
  }

  // j/k (or arrows) move through lines, Enter opens one.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        event.key === "j" ||
        event.key === "ArrowDown" ||
        event.key === "k" ||
        event.key === "ArrowUp"
      ) {
        if (entries.length === 0) return;
        event.preventDefault();
        const step = event.key === "j" || event.key === "ArrowDown" ? 1 : -1;
        setCursor((current) => {
          const next = Math.min(entries.length - 1, Math.max(0, current + step));
          tableRef.current
            ?.querySelector(`[data-log-id="${entries[next]?.id}"]`)
            ?.scrollIntoView({ block: "nearest" });
          return next;
        });
      } else if (event.key === "Enter" && cursor >= 0) {
        const entry = entries[cursor];
        if (entry) select(entry.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, entries, select]);

  const preview = entries.find((entry) => entry.id === selected) ?? null;
  const cursorId = cursor >= 0 ? entries[cursor]?.id : undefined;
  const exportSearch = viewSearch({ ...view, preset: null });

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pe-1">
        <LogFilterSidebar
          apiKeyNames={props.apiKeyNames}
          facets={props.facets}
          filters={filters}
          from={view.from}
          onPreset={(preset) => navigate({ preset })}
          onRange={(from, to) =>
            navigate({ preset: null, from: from.toISOString(), to: to.toISOString() })
          }
          onReset={() => setQuery("")}
          onToggle={(field: ListField, value) => setQuery(toggleFilter(view.q, field, value))}
          pending={pending}
          preset={view.preset}
          to={view.to}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <LogSearch onSubmit={setQuery} value={view.q} />
          <Toggle
            aria-label={live ? "Stop following new lines" : "Follow new lines"}
            onPressedChange={toggleLive}
            pressed={live}
            variant="outline"
          >
            {live ? <PauseIcon /> : <PlayIcon />}
            Live
            {live ? <span className="size-1.5 animate-pulse rounded-full bg-success" /> : null}
          </Toggle>
          <Button
            aria-label="Refresh"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
            size="icon"
            variant="outline"
          >
            {pending ? <Spinner /> : <RefreshCwIcon />}
          </Button>
          <Menu>
            <MenuTrigger render={<Button aria-label="Download" size="icon" variant="outline" />}>
              <DownloadIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                render={<a download href={`${logsPath}/export?${exportSearch}&format=csv`} />}
              >
                Download CSV
              </MenuItem>
              <MenuItem
                render={<a download href={`${logsPath}/export?${exportSearch}&format=ndjson`} />}
              >
                Download NDJSON
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>

        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <LogHistogramChart
            histogram={props.histogram}
            onSelectRange={(from, to) =>
              navigate({ preset: null, from: from.toISOString(), to: to.toISOString() })
            }
          />
        </div>

        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>
            {compactCount(props.facets.total)} {props.facets.total === 1 ? "line" : "lines"} · times
            in UTC
          </span>
          <span className="hidden sm:inline">
            <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move,{" "}
            <kbd className="font-mono">Enter</kbd> to open
          </span>
        </div>

        {entries.length === 0 ? (
          <Empty className="rounded-xl border py-16">
            <EmptyHeader>
              <EmptyTitle>No logs found</EmptyTitle>
              <EmptyDescription>
                {view.q
                  ? "Nothing matches these filters in this time range. Try a longer range or fewer filters."
                  : "API requests, email events and webhook attempts of this environment show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className={`overflow-hidden rounded-xl border ${pending ? "opacity-60" : ""} transition-opacity`}
          >
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-48" />
                <col className="w-36" />
                <col />
                <col className="hidden w-64 lg:table-column" />
                <col className="w-20" />
              </colgroup>
              <thead className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                <tr>
                  <th className="py-2 ps-3 font-medium">Time</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Request / message</th>
                  <th className="hidden py-2 font-medium lg:table-cell">Resource</th>
                  <th className="py-2 pe-3 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody ref={tableRef}>
                {entries.map((entry) => (
                  <Row
                    entry={entry}
                    fresh={fresh.has(entry.id)}
                    key={entry.id}
                    onOpen={() => {
                      setCursor(entries.indexOf(entry));
                      select(entry.id);
                    }}
                    selected={entry.id === selected || entry.id === cursorId}
                  />
                ))}
              </tbody>
            </table>
            {hasMore && !live ? (
              <div className="flex justify-center border-t p-2">
                <Button disabled={loadingMore} onClick={loadOlder} size="sm" variant="ghost">
                  {loadingMore ? <Spinner /> : null}
                  Load older lines
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <LogDetailSheet
        apiKeyNames={props.apiKeyNames}
        entriesPath={`${logsPath}/entries`}
        entryId={selected}
        envPath={props.envPath}
        onClose={() => select(null)}
        onFilter={(token) => {
          select(null);
          setQuery(token);
        }}
        onSelect={(entry) => select(entry.id)}
        preview={preview}
      />
    </div>
  );
}
