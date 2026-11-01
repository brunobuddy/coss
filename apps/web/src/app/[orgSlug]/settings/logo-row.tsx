"use client";

import { Button } from "@coss/ui/components/button";
import { useActionToast } from "@/lib/toast";
import { hideLogoAction, refreshLogoAction } from "./actions";

/** Find the logo again, or stop using it. */
export function LogoActions(props: { orgSlug: string; hidden: boolean; found: boolean }) {
  const [, refresh, refreshing] = useActionToast(refreshLogoAction, {
    errors: "toast",
    success: {
      title: "Looking for your logo",
      description: "It shows up within a minute.",
      type: "info",
    },
  });
  const [, hide, hiding] = useActionToast(hideLogoAction, {
    errors: "toast",
    success: "Logo removed",
  });
  return (
    <div className="flex gap-2">
      <form action={refresh}>
        <input name="orgSlug" type="hidden" value={props.orgSlug} />
        <Button disabled={refreshing} size="sm" type="submit" variant="outline">
          {props.hidden ? "Use a logo again" : "Find again"}
        </Button>
      </form>
      {props.found ? (
        <form action={hide}>
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <Button disabled={hiding} size="sm" type="submit" variant="ghost">
            Use initials instead
          </Button>
        </form>
      ) : null}
    </div>
  );
}
