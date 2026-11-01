import "server-only";
import type { EnvironmentMode } from "@coss/tenancy";
import { emailRuntime } from "@/lib/email-runtime";

/**
 * Whether the dashboard may receive a test email for an environment: sandbox environments
 * always, live ones only while the dashboard runs the fake provider (local development).
 */
export function canSimulateReceiving(mode: EnvironmentMode): boolean {
  const runtime = emailRuntime();
  return runtime.inbound !== null && (mode === "sandbox" || runtime.provider === "fake");
}
