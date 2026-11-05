"use client";

import { Button } from "@coss/ui/components/button";
import { useActionToast } from "@/lib/toast";
import { applyRiskReasonWeightsAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

/**
 * Sets reason weights: `weights` maps codes to a weight, or `null` to go back to the default.
 * The page re-renders with the new weights after it succeeds.
 */
export function ApplyWeightsButton(
  props: Target & {
    weights: Record<string, number | null>;
    label: string;
    variant?: "default" | "outline" | "ghost";
    size?: "xs" | "sm";
  },
) {
  const [, formAction, pending] = useActionToast(applyRiskReasonWeightsAction, {
    success: "Reason weights saved",
    errors: "toast",
  });
  return (
    <form action={formAction} className="flex justify-end">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="weights" type="hidden" value={JSON.stringify(props.weights)} />
      <Button
        loading={pending}
        size={props.size ?? "xs"}
        type="submit"
        variant={props.variant ?? "outline"}
      >
        {props.label}
      </Button>
    </form>
  );
}
