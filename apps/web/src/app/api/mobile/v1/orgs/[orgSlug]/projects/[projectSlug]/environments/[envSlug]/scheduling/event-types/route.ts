import type { Page, SchedulingEventType } from "@coss/companion";
import { listEventTypes } from "@coss/scheduling";
import { cursorParam, mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { requireSchedulingDeps, SCHEDULING_PAGE, toMobileEventType } from "../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/event-types">,
  ) => {
    const { scope } = await requireMobileEnvironment(request, await ctx.params, {
      scheduling: ["read"],
    });
    requireSchedulingDeps();
    const page = await listEventTypes(scope, {
      limit: SCHEDULING_PAGE,
      after: cursorParam(request),
    });
    return {
      data: page.data.map(toMobileEventType),
      next_cursor: page.hasMore ? (page.data.at(-1)?.id ?? null) : null,
    } satisfies Page<SchedulingEventType>;
  },
);
