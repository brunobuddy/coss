import "server-only";
import { emailRuntime } from "@/lib/email-runtime";

/** Whether the dashboard may ingest sample DMARC reports: only with the fake provider (development). */
export function canSimulateDmarcReports(): boolean {
  const runtime = emailRuntime();
  return runtime.provider === "fake" && runtime.inbound !== null;
}
