"use client";

import { Button } from "@coss/ui/components/button";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { sendSampleDmarcReportAction } from "./actions";

export function SampleReportButton(props: { orgSlug: string; domainId: string }) {
  const [state, formAction, pending] = useActionState(sendSampleDmarcReportAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Send a sample report
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
