import { sentryConfig, sentryOptions } from "@coss/observability";
import * as Sentry from "@sentry/nextjs";

/**
 * Runs once when a server starts: validates the environment (the standalone server never loads
 * next.config.ts) and starts Sentry. A misconfigured production task exits at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    await import("./env");
  } catch (error) {
    if (process.env.NODE_ENV !== "production") throw error;
    console.error("[scheduling] Refusing to start:", error);
    process.exit(1);
  }
  const config = sentryConfig(process.env);
  if (config) {
    Sentry.init({
      ...sentryOptions(config, "scheduling"),
      integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    });
  }
}

/** Errors thrown while rendering, in route handlers and the proxy. */
export const onRequestError = Sentry.captureRequestError;
