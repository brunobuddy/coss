import type { Page, SchedulingHost } from "@coss/companion";
import { listHosts } from "@coss/scheduling";
import { cursorParam, mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { requireSchedulingDeps, SCHEDULING_PAGE, toMobileHost } from "../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/hosts">,
  ) => {
    const { scope } = await requireMobileEnvironment(request, await ctx.params, {
      scheduling: ["read"],
    });
    requireSchedulingDeps();
    const page = await listHosts(scope, { limit: SCHEDULING_PAGE, after: cursorParam(request) });
    return {
      data: page.data.map(toMobileHost),
      next_cursor: page.hasMore ? (page.data.at(-1)?.id ?? null) : null,
    } satisfies Page<SchedulingHost>;
  },
);
