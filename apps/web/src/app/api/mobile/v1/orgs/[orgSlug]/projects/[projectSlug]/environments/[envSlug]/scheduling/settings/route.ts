import type { SchedulingSettings } from "@coss/companion";
import { getSettings } from "@coss/scheduling";
import { mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { requireSchedulingDeps, toMobileSchedulingSettings } from "../wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/scheduling/settings">,
  ) => {
    const { scope } = await requireMobileEnvironment(request, await ctx.params, {
      scheduling: ["read"],
    });
    requireSchedulingDeps();
    return toMobileSchedulingSettings(await getSettings(scope)) satisfies SchedulingSettings;
  },
);
