import type { SchedulingEventType } from "@coss/companion";
import { getEventType } from "@coss/scheduling";
import { mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { requireSchedulingDeps, schedulingError, toMobileEventType } from "../../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/event-types/[eventTypeId]">,
  ) => {
    const { eventTypeId, ...params } = await ctx.params;
    const { scope } = await requireMobileEnvironment(request, params, { scheduling: ["read"] });
    requireSchedulingDeps();
    try {
      return toMobileEventType(
        await getEventType(scope, eventTypeId),
      ) satisfies SchedulingEventType;
    } catch (error) {
      throw schedulingError(error);
    }
  },
);
