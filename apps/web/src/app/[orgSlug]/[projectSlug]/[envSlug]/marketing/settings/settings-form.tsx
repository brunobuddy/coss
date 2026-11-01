"use client";

import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Textarea } from "@coss/ui/components/textarea";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { saveMarketingSettingsAction } from "./actions";

export function MarketingSettingsForm(
  props: MarketingFormTarget & {
    displayName: string | null;
    mailingAddress: string | null;
    doubleOptInDefault: boolean;
    confirmationFrom: string | null;
    confirmationSubject: string | null;
    confirmationHtml: string | null;
    confirmedRedirectUrl: string | null;
    canEdit: boolean;
  },
) {
  const [state, formAction, pending] = useActionState(saveMarketingSettingsAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TargetInputs {...props} />
      <Field>
        <FieldLabel>Sender name</FieldLabel>
        <Input
          defaultValue={props.displayName ?? ""}
          disabled={!props.canEdit}
          maxLength={200}
          name="displayName"
          placeholder="Your organization's name"
        />
        <FieldDescription>Shown in the preference center: “Emails from …”.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Postal address</FieldLabel>
        <Textarea
          defaultValue={props.mailingAddress ?? ""}
          disabled={!props.canEdit}
          maxLength={500}
          name="mailingAddress"
          placeholder={"Acme Inc.\n548 Market St\nSan Francisco, CA 94104, USA"}
          rows={4}
        />
        <FieldDescription>
          Every marketing email carries it in its footer (the CAN-SPAM Act requires a valid physical
          address). Marketing email can't be sent without one.
        </FieldDescription>
      </Field>
      <h3 className="mt-2 font-medium text-sm">Double opt-in</h3>
      <Label>
        <Checkbox
          defaultChecked={props.doubleOptInDefault}
          disabled={!props.canEdit}
          name="doubleOptInDefault"
          value="on"
        />
        Ask contacts added through the API to confirm by email (unless the request says otherwise)
      </Label>
      <p className="text-muted-foreground text-xs">
        Contacts you add or import in the dashboard are added as you set them: you vouch for their
        consent.
      </p>
      <Field>
        <FieldLabel>Confirmation sender</FieldLabel>
        <Input
          defaultValue={props.confirmationFrom ?? ""}
          disabled={!props.canEdit}
          name="confirmationFrom"
          placeholder="Acme <news@acme.com>"
        />
        <FieldDescription>
          An address on a verified domain (for live environments).
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Confirmation subject</FieldLabel>
        <Input
          defaultValue={props.confirmationSubject ?? ""}
          disabled={!props.canEdit}
          maxLength={998}
          name="confirmationSubject"
          placeholder="Confirm your subscription to …"
        />
      </Field>
      <Field>
        <FieldLabel>Confirmation HTML</FieldLabel>
        <Textarea
          className="font-mono text-xs"
          defaultValue={props.confirmationHtml ?? ""}
          disabled={!props.canEdit}
          name="confirmationHtml"
          placeholder="coss.com's default email"
          rows={5}
        />
        <FieldDescription>
          Must contain <code>{"{{{confirmation_url}}}"}</code> where the link goes.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>After confirming, go to</FieldLabel>
        <Input
          defaultValue={props.confirmedRedirectUrl ?? ""}
          disabled={!props.canEdit}
          name="confirmedRedirectUrl"
          placeholder="https://acme.com/welcome (default: a coss.com page)"
          type="url"
        />
      </Field>
      {state?.ok ? <p className="text-muted-foreground text-sm">Saved.</p> : null}
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canEdit ? (
        <div>
          <Button loading={pending} type="submit">
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}
