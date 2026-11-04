import type { EnvironmentHomeResponse } from "@coss/companion";
import { inUseElsewhereLabel } from "@coss/dashboard-routes";
import {
  activityTitle,
  groupActivity,
  HOME_DAYS,
  LEVEL_SEVERITY,
  loadEnvironmentHome,
  SOURCE_PRODUCT,
} from "@/lib/environment-home";
import { mobileRoute, requireMobileEnvironment } from "@/lib/mobile-api";
import { toMobileEnvironment } from "@/lib/mobile-wire";
import { PRODUCT_FIGURES } from "@/lib/products";

export const dynamic = "force-dynamic";

/** The dashboard's environment home, from the data its page uses. */
export const GET = mobileRoute(
  async (
    request,
    ctx: RouteContext<"/api/mobile/v1/orgs/[orgSlug]/projects/[projectSlug]/environments/[envSlug]/home">,
  ) => {
    const context = await requireMobileEnvironment(request, await ctx.params, {
      environment: ["read"],
    });
    const { organization, project, environment, session, can } = context;
    const home = await loadEnvironmentHome({
      organizationId: organization.id,
      projectId: project.id,
      userId: session.user.id,
      environment,
      can,
    });
    return {
      project: { id: project.id, name: project.name, slug: project.slug },
      environment: toMobileEnvironment(environment),
      days: HOME_DAYS,
      summary: home.summary,
      attention: home.attention,
      products: home.yourProducts.map((product) => {
        const elsewhere = home.use.elsewhere[product.key];
        return {
          key: product.key,
          count: home.figures[product.key],
          ...PRODUCT_FIGURES[product.key],
          daily: home.daily[product.key],
          elsewhere: elsewhere ? inUseElsewhereLabel(elsewhere) : null,
        };
      }),
      discover: (Object.keys(PRODUCT_FIGURES) as (keyof typeof PRODUCT_FIGURES)[]).filter(
        (key) => !home.yours.includes(key),
      ),
      activity: home.logs
        ? groupActivity(home.logs.data)
            .slice(0, 8)
            .map(({ line, count }) => ({
              id: line.id,
              title: activityTitle(line),
              type: line.type,
              source: line.source,
              product: SOURCE_PRODUCT[line.source] ?? null,
              severity: LEVEL_SEVERITY[line.level],
              count,
              occurred_at: line.occurred_at,
            }))
        : null,
    } satisfies EnvironmentHomeResponse;
  },
);
