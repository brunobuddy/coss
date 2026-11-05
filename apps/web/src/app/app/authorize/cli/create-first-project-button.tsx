"use client";

import { Button } from "@coss/ui/components/button";
import { createFirstProjectAction } from "@/app/onboarding/actions";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";

/** Creates an organization's first project; the page then re-renders with its environments. */
export function CreateFirstProjectButton(props: { orgSlug: string; name: string }) {
  const [state, formAction, pending] = useActionToast(createFirstProjectAction, {
    success: "Project created",
  });
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <Button loading={pending} type="submit">
        Create a project in {props.name}
      </Button>
    </form>
  );
}
