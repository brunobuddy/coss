"use server";

import { isProductKey } from "@coss/dashboard-routes";
import { setProductPreference } from "@coss/tenancy";
import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { ActionError, formString, runAction } from "@/lib/actions";
import { requireOrgMember } from "@/lib/session";

type Choice = "pin" | "hide" | "reset";

/** A member's own sidebar: pin a product, hide it, or show it again while it's in use. */
export async function setProductPreferenceAction(
  _previous: ActionResult<Choice> | null,
  formData: FormData,
): Promise<ActionResult<Choice>> {
  return runAction(async () => {
    const context = await requireOrgMember(formString(formData, "orgSlug"));
    const product = formString(formData, "product");
    const choice = formString(formData, "choice");
    if (!isProductKey(product)) throw new ActionError("That product doesn't exist.");
    if (choice !== "pin" && choice !== "hide" && choice !== "reset") {
      throw new ActionError("Choose to pin, hide or reset the product.");
    }
    await setProductPreference({
      organizationId: context.organization.id,
      userId: context.session.user.id,
      product,
      pinned: choice === "pin" ? true : choice === "hide" ? false : null,
    });
    refresh();
    return choice;
  });
}
