import type { SchedulingBookingActionResponse } from "@coss/companion";
import { approveBooking } from "@coss/scheduling";
import { recordAudit } from "@/lib/audit";
import { mobileRoute, requireMobileEnvironment, requireMobileWrite } from "@/lib/mobile-api";
import {
  hostNamesOf,
  requireSchedulingDeps,
  schedulingError,
  toMobileBooking,
} from "../../../wire";

export const dynamic = "force-dynamic";

/** The dashboard's approveBookingAction: same checks, same audit event. */
export const POST = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/bookings/[bookingId]/approve">,
  ) => {
    const { bookingId, ...params } = await ctx.params;
    const context = await requireMobileEnvironment(request, params, { scheduling: ["read"] });
    requireMobileWrite(context, { scheduling: ["update"] });
    const deps = requireSchedulingDeps();
    const { scope, environment, session } = context;
    try {
      const booking = await approveBooking(
        {
          organizationId: scope.organizationId,
          projectId: environment.projectId,
          environmentId: scope.environmentId,
          mode: environment.mode,
        },
        bookingId,
        deps,
        { kind: "user", id: session.user.id },
      );
      await recordAudit(session, {
        organizationId: scope.organizationId,
        action: "scheduling_booking.approved",
        target: { type: "scheduling_booking", id: booking.id },
      });
      return {
        booking: toMobileBooking(booking, await hostNamesOf(scope, [booking])),
      } satisfies SchedulingBookingActionResponse;
    } catch (error) {
      throw schedulingError(error);
    }
  },
);
