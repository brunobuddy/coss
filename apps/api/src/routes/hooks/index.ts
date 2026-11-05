import type { UsageGate } from "@coss/billing/gate";
import type { HookManagementDeps } from "@coss/hooks";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../../types.ts";
import { createHookApplicationRoutes } from "./applications.ts";
import { createHookEndpointRoutes } from "./endpoints.ts";
import { createHookEventTypeRoutes } from "./event-types.ts";
import { createHookMessageRoutes } from "./messages.ts";

/** Hooks (webhooks as a service): `/v1/hooks/*`. */
export function createHookRoutes(
  deps: HookManagementDeps & { portalUrl: string | null; billing?: UsageGate | undefined },
) {
  const router = new OpenAPIHono<AppEnv>();
  router.route("/", createHookEventTypeRoutes());
  router.route("/", createHookApplicationRoutes());
  router.route("/", createHookEndpointRoutes(deps));
  router.route("/", createHookMessageRoutes(deps));
  return router;
}
