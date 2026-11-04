import type { SchedulingHostResponse } from "@coss/companion";
import { getHost, listConnections, listSchedules } from "@coss/scheduling";
import { mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import {
  requireSchedulingDeps,
  schedulingError,
  toMobileCalendar,
  toMobileHost,
  toMobileSchedule,
} from "../../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/hosts/[hostId]">,
  ) => {
    const { hostId, ...params } = await ctx.params;
    const { scope } = await requireMobileEnvironment(request, params, { scheduling: ["read"] });
    requireSchedulingDeps();
    try {
      const [host, schedules, connections] = await Promise.all([
        getHost(scope, hostId),
        listSchedules(scope, hostId),
        listConnections(scope, hostId),
      ]);
      return {
        host: toMobileHost(host),
        schedules: schedules.map(toMobileSchedule),
        calendars: connections.map(toMobileCalendar),
      } satisfies SchedulingHostResponse;
    } catch (error) {
      throw schedulingError(error);
    }
  },
);
