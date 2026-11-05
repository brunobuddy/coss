"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { recordRiskFeedbackAction } from "../actions";

const OUTCOMES = [
  { value: "legitimate", label: "Legitimate", variant: "outline" },
  { value: "abuse", label: "Abuse", variant: "destructive-outline" },
  { value: "fraud", label: "Fraud", variant: "destructive" },
] as const;

export function RiskFeedbackForm(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  assessmentId: string;
}) {
  const [state, formAction, pending] = useActionToast(recordRiskFeedbackAction, {
    success: ({ outcome }) => `Marked as ${outcome}`,
  });
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="assessmentId" type="hidden" value={props.assessmentId} />
      <Field>
        <FieldLabel>Note</FieldLabel>
        <Input maxLength={500} name="note" placeholder="Optional, for your team" />
        <FieldDescription>
          Fraud and abuse make later assessments flag this mailbox, user, card, browser, IP address
          and subnet; legitimate takes that back.
        </FieldDescription>
      </Field>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((outcome) => (
          <Button
            disabled={pending}
            key={outcome.value}
            name="outcome"
            size="sm"
            type="submit"
            value={outcome.value}
            variant={outcome.variant}
          >
            {outcome.label}
          </Button>
        ))}
      </div>
    </form>
  );
}
