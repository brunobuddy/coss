"use server";

import { createFirstProject, recordSignupAttribution } from "@coss/tenancy";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { formString, runAction } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { requireOrgPermission, requireSession } from "@/lib/session";

/** An organization's first project, so a new owner has an environment and API keys at once. */
export async function createFirstProjectAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { organization, session } = await requireOrgPermission(formString(formData, "orgSlug"), {
      project: ["create"],
    });
    const created = await createFirstProject({ organizationId: organization.id });
    if (created) {
      await recordAudit(session, {
        organizationId: organization.id,
        action: "project.created",
        target: { type: "project", id: created.project.id, label: created.project.name },
        projectId: created.project.id,
      });
    }
    refresh();
    return null;
  });
}

const CAMPAIGN_VALUE = z
  .string()
  .regex(/^[\w.+ -]{1,100}$/)
  .nullable();

const FirstTouch = z.strictObject({
  landingPath: z.string().startsWith("/").max(200),
  referrerHost: z
    .string()
    .regex(/^[a-z0-9.-]{1,253}$/)
    .nullable(),
  utmSource: CAMPAIGN_VALUE,
  utmMedium: CAMPAIGN_VALUE,
  utmCampaign: CAMPAIGN_VALUE,
  landedAt: z.iso.datetime().pipe(z.coerce.date()),
});

/**
 * What the browser remembers of the visit that led to this account. Written only for the signed-in
 * user, never while impersonating them; a value that doesn't parse is simply dropped.
 */
export async function recordSignupAttributionAction(touch: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    if (session.session.impersonatedBy) return null;
    const parsed = FirstTouch.safeParse(touch);
    if (parsed.success) {
      await recordSignupAttribution({ userId: session.user.id, ...parsed.data });
    }
    return null;
  });
}
