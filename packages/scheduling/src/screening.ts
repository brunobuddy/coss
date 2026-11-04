/**
 * Booking emails skip per-email screening, which would send patients' names to the AI Gateway, so
 * what a customer can put in them is checked when it's set up: an abuser can't put phishing in an
 * event title and mail it to anyone. Live environments only; injected, like Forms' hosted pages.
 */
import { isHipaaMode } from "@coss/compliance";
import { SchedulingError } from "./errors.ts";

export type SetupScreening = (input: { organizationId: string; text: string }) => Promise<boolean>;

const URL_LIKE =
  /https?:\/\/|www\.|(?<![a-z0-9-])[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|info|biz|co)\b/i;

/** Text that lands in emails can't carry a link: the only link in them is the manage link. */
export function refuseLinks(value: string | null | undefined, param: string): void {
  if (value && URL_LIKE.test(value)) {
    throw new SchedulingError("content_refused", "This text can't contain a link.", { param });
  }
}

export async function screenSetup(
  env: { organizationId: string; mode: "live" | "sandbox" },
  text: string,
  screen: SetupScreening | undefined,
  param: string,
): Promise<void> {
  if (env.mode !== "live" || !screen || !text.trim()) return;
  if (await isHipaaMode(env.organizationId)) return;
  if (!(await screen({ organizationId: env.organizationId, text }))) {
    throw new SchedulingError(
      "content_refused",
      "This text looks like phishing or spam, so it can't be used. Contact support if that's wrong.",
      { param },
    );
  }
}
