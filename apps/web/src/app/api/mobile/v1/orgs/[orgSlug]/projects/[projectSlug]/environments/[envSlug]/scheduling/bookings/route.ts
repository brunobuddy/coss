import type { Page, SchedulingBooking } from "@coss/companion";
import { listBookings } from "@coss/scheduling";
import { cursorParam, mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { hostNamesOf, requireSchedulingDeps, SCHEDULING_PAGE, toMobileBooking } from "../wire";

export const dynamic = "force-dynamic";

const VIEWS = {
  upcoming: (now: Date) => ({
    order: "start_asc" as const,
    endAfter: now,
    statuses: ["held" as const, "pending_approval" as const, "confirmed" as const],
  }),
  past: (now: Date) => ({ order: "start_desc" as const, endBefore: now }),
  pending: () => ({ order: "start_asc" as const, status: "pending_approval" as const }),
};

function instantParam(request: Request, name: string): Date | undefined {
  const value = new URL(request.url).searchParams.get(name);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function viewOf(request: Request): keyof typeof VIEWS {
  const view = new URL(request.url).searchParams.get("view");
  return view === "past" || view === "pending" ? view : "upcoming";
}

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings">,
  ) => {
    const { scope } = await requireMobileEnvironment(request, await ctx.params, {
      scheduling: ["read"],
    });
    const deps = requireSchedulingDeps();
    const host = new URL(request.url).searchParams.get("host") ?? undefined;
    const page = await listBookings(
      scope,
      {
        limit: SCHEDULING_PAGE,
        after: cursorParam(request),
        hostRef: host,
        startAfter: instantParam(request, "from"),
        startBefore: instantParam(request, "to"),
        ...VIEWS[viewOf(request)](new Date()),
      },
      deps,
    );
    const names = await hostNamesOf(scope, page.data);
    return {
      data: page.data.map((booking) => toMobileBooking(booking, names)),
      next_cursor: page.hasMore ? (page.data.at(-1)?.id ?? null) : null,
    } satisfies Page<SchedulingBooking>;
  },
);
