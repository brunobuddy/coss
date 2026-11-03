import { PLAN_KEYS, PLANS, type PlanKey } from "@coss/billing/catalog";
import {
  listSupportQueue,
  SUPPORT_VIEWS,
  type SupportQueueItem,
  type SupportView,
  supportQueueCounts,
} from "@coss/support/admin";
import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import { InboxIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";
import { listHref, stringParam } from "@/components/admin/list-controls";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks } from "@/components/filter-links";
import { SearchForm } from "@/components/search-form";
import { StatusDot } from "@/components/status-dot";
import { DeskKeyboard } from "@/components/support/desk-live";
import { formatRelative } from "@/lib/format";
import { formatDue } from "@/lib/support";

const VIEW_LABELS: Record<SupportView, string> = {
  needs_reply: "Needs reply",
  mine: "Mine",
  unassigned: "Unassigned",
  waiting: "Waiting on customer",
  snoozed: "Snoozed",
  resolved: "Resolved",
  spam: "Spam",
};

export type QueueFilters = { view: SupportView; plan: PlanKey | undefined; q: string };

export function queueFilters(search: Record<string, string | string[] | undefined>): QueueFilters {
  const view = stringParam(search.view) as SupportView;
  const plan = stringParam(search.plan) as PlanKey;
  return {
    view: SUPPORT_VIEWS.includes(view) ? view : "needs_reply",
    plan: PLAN_KEYS.includes(plan) ? plan : undefined,
    q: stringParam(search.q),
  };
}

export function queueQuery(filters: QueueFilters): string {
  const params = new URLSearchParams();
  if (filters.view !== "needs_reply") params.set("view", filters.view);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function Row(props: { item: SupportQueueItem; href: string; active: boolean; now: Date }) {
  const { item, now } = props;
  const due = item.responseDueAt ? formatDue(item.responseDueAt, now) : null;
  const confirmed = item.organizationId !== null;
  return (
    <Link
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex flex-col gap-1.5 border-b px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/56",
        props.active && "bg-muted",
      )}
      href={props.href}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{item.subject}</span>
        {due ? (
          <StatusDot className="font-mono text-xs" tone={due.overdue ? "error" : "neutral"}>
            {due.label}
          </StatusDot>
        ) : (
          <span className="font-mono text-muted-foreground text-xs">
            {formatRelative(item.lastMessageAt, now)}
          </span>
        )}
      </span>
      <span className="truncate text-muted-foreground text-xs">{item.snippet || "(No text)"}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        <Badge size="sm" variant={item.plan === "free" ? "outline" : "secondary"}>
          {PLANS[item.plan as PlanKey]?.name ?? item.plan}
        </Badge>
        {item.severity === "urgent" ? (
          <Badge size="sm" variant="error">
            Urgent
          </Badge>
        ) : null}
        {item.senderAuth === "unverified" ? (
          <Badge size="sm" variant="warning">
            <ShieldAlertIcon />
            Unverified
          </Badge>
        ) : null}
        {item.filterReason ? (
          <Badge size="sm" variant="outline">
            {item.filterReason === "auto"
              ? "Automated"
              : item.filterReason === "flood"
                ? "Flood"
                : "Spam"}
          </Badge>
        ) : null}
        <span className="min-w-0 truncate text-muted-foreground">
          {item.organizationName
            ? `${item.organizationName}${confirmed ? "" : "?"}`
            : item.requesterEmail}
        </span>
        <span className="ms-auto shrink-0 text-muted-foreground">#{item.number}</span>
      </span>
    </Link>
  );
}

/** The queue: most urgent first. Filters live in the URL, so a ticket's link keeps them. */
export async function SupportQueue(props: {
  filters: QueueFilters;
  actorUserId: string;
  activeTicketId: string | null;
  className?: string;
}) {
  const { filters } = props;
  const now = new Date();
  const [items, counts] = await Promise.all([
    listSupportQueue({
      view: filters.view,
      plan: filters.plan,
      search: filters.q,
      actorUserId: props.actorUserId,
    }),
    supportQueueCounts(props.actorUserId),
  ]);
  const query = queueQuery(filters);
  const hrefOf = (id: string) => `/admin/support/${id}${query}`;
  const filterHref = (overrides: Partial<Record<"view" | "plan" | "q", string | undefined>>) =>
    listHref("/admin/support", {
      view: filters.view === "needs_reply" ? undefined : filters.view,
      plan: filters.plan,
      q: filters.q || undefined,
      ...overrides,
    });
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card lg:w-96 lg:shrink-0",
        props.className,
      )}
    >
      <div className="flex flex-col gap-2 border-b p-3">
        <nav aria-label="Views" className="flex flex-wrap gap-1">
          {SUPPORT_VIEWS.map((view) => (
            <Link
              aria-current={view === filters.view ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted",
                view === filters.view ? "bg-muted font-medium" : "text-muted-foreground",
              )}
              href={filterHref({ view: view === "needs_reply" ? undefined : view })}
              key={view}
            >
              {VIEW_LABELS[view]}
              {view !== "resolved" && counts[view] > 0 ? (
                <span className="font-mono text-[0.6875rem]">{counts[view]}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <FilterLinks
            options={[
              { value: "all", label: "All", href: filterHref({ plan: undefined }) },
              ...PLAN_KEYS.map((plan) => ({
                value: plan,
                label: PLANS[plan].name,
                href: filterHref({ plan }),
              })),
            ]}
            value={filters.plan ?? "all"}
          />
          <SearchForm
            action="/admin/support"
            keep={{
              view: filters.view === "needs_reply" ? undefined : filters.view,
              plan: filters.plan,
            }}
            name="q"
            placeholder="Search tickets"
            query={filters.q}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            compact
            description="Nothing here right now."
            icon={InboxIcon}
            title={`No tickets in ${VIEW_LABELS[filters.view]}`}
          />
        ) : (
          items.map((item) => (
            <Row
              active={item.id === props.activeTicketId}
              href={hrefOf(item.id)}
              item={item}
              key={item.id}
              now={now}
            />
          ))
        )}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-muted-foreground text-xs">
        <span className="hidden gap-2 xl:inline-flex">j k move · r reply · n note · e resolve</span>
        <span className="flex items-center gap-3">
          <Link className="underline underline-offset-2" href="/admin/support/saved-replies">
            Saved replies
          </Link>
          <AutoRefresh renderedAt={now.toISOString()} seconds={15} />
        </span>
      </div>
      <DeskKeyboard
        currentHref={props.activeTicketId ? hrefOf(props.activeTicketId) : null}
        hrefs={items.map((item) => hrefOf(item.id))}
      />
    </aside>
  );
}
