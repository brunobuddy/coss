import type { SchedulingBooking } from "@coss/companion";
import { getBooking } from "@coss/scheduling";
import { mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { hostNamesOf, requireSchedulingDeps, schedulingError, toMobileBooking } from "../../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]">,
  ) => {
    const { bookingId, ...params } = await ctx.params;
    const { scope } = await requireMobileEnvironment(request, params, { scheduling: ["read"] });
    const deps = requireSchedulingDeps();
    try {
      const booking = await getBooking(scope, bookingId, deps);
      return toMobileBooking(
        booking,
        await hostNamesOf(scope, [booking]),
      ) satisfies SchedulingBooking;
    } catch (error) {
      throw schedulingError(error);
    }
  },
);
