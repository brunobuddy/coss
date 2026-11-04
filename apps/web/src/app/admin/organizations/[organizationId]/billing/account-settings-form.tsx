"use client";

import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Textarea } from "@coss/ui/components/textarea";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { updateAccountSettingsAction } from "./actions";

export type AccountSettingsValues = {
  provider: string;
  collectionMethod: string;
  netTermsDays: number;
  allowedPaymentMethods: string[];
  requiredPaymentMethods: string[];
  taxMode: string;
  billingEmail: string;
  billingCc: string;
  billingName: string;
  taxId: string;
  graceDays: number;
  holdExemptUntil: string;
  creditLimit: string;
  notes: string;
};

function SelectField(props: {
  label: string;
  name: string;
  defaultValue: string;
  items: { value: string; label: string }[];
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select defaultValue={props.defaultValue} items={props.items} name={props.name}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {props.items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

/** How the account is invoiced and collected (platform admins). */
export function AccountSettingsForm(props: {
  organizationId: string;
  values: AccountSettingsValues;
  methods: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionToast(updateAccountSettingsAction, {
    success: "Billing settings saved",
  });
  const { values } = props;
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input name="organizationId" type="hidden" value={props.organizationId} />
      <SelectField
        defaultValue={values.provider}
        description="Changing it forgets the customer at the old provider."
        items={[
          { value: "stripe", label: "Stripe" },
          { value: "manual", label: "Manual (invoiced off-Stripe)" },
          { value: "fake", label: "Fake (development)" },
        ]}
        label="Payment provider"
        name="provider"
      />
      <SelectField
        defaultValue={values.collectionMethod}
        items={[
          { value: "charge_automatically", label: "Charge the payment method" },
          { value: "send_invoice", label: "Send invoices with net terms" },
        ]}
        label="Collection"
        name="collectionMethod"
      />
      <Field>
        <FieldLabel>Net terms (days)</FieldLabel>
        <Input defaultValue={values.netTermsDays} min={0} name="netTermsDays" type="number" />
      </Field>
      <Field>
        <FieldLabel>Grace before holding live sending (days)</FieldLabel>
        <Input defaultValue={values.graceDays} min={0} name="graceDays" type="number" />
      </Field>
      <Field>
        <FieldLabel>Allowed payment methods</FieldLabel>
        <div className="flex flex-col gap-1">
          {props.methods.map((method) => (
            <Label className="flex items-center gap-2" key={method.value}>
              <Checkbox
                defaultChecked={values.allowedPaymentMethods.includes(method.value)}
                name="allowedPaymentMethods"
                value={method.value}
              />
              {method.label}
            </Label>
          ))}
        </div>
      </Field>
      <Field>
        <FieldLabel>Required payment methods</FieldLabel>
        <div className="flex flex-col gap-1">
          {props.methods.map((method) => (
            <Label className="flex items-center gap-2" key={method.value}>
              <Checkbox
                defaultChecked={values.requiredPaymentMethods.includes(method.value)}
                name="requiredPaymentMethods"
                value={method.value}
              />
              {method.label}
            </Label>
          ))}
        </div>
        <FieldDescription>
          e.g. direct debit only for high spend; none required by default.
        </FieldDescription>
      </Field>
      <SelectField
        defaultValue={values.taxMode}
        items={[
          { value: "none", label: "No tax" },
          { value: "stripe_automatic", label: "Stripe Tax (automatic)" },
        ]}
        label="Tax"
        name="taxMode"
      />
      <Field>
        <FieldLabel>Hold exemption until</FieldLabel>
        <Input defaultValue={values.holdExemptUntil} name="holdExemptUntil" type="date" />
        <FieldDescription>
          Overdue invoices and the credit limit don't pause sending before this date.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Credit limit (USD)</FieldLabel>
        <Input
          defaultValue={values.creditLimit}
          min={0}
          name="creditLimit"
          step="0.01"
          type="number"
        />
        <FieldDescription>
          Empty: automatic for self-serve, none for contracts and net terms. A value replaces it and
          also clears a hold from a fraud dispute or a failed charge.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Billing email</FieldLabel>
        <Input defaultValue={values.billingEmail} name="billingEmail" type="email" />
      </Field>
      <Field>
        <FieldLabel>CC (comma-separated)</FieldLabel>
        <Input defaultValue={values.billingCc} name="billingCc" />
      </Field>
      <Field>
        <FieldLabel>Legal name on invoices</FieldLabel>
        <Input defaultValue={values.billingName} name="billingName" />
      </Field>
      <Field>
        <FieldLabel>Tax ID</FieldLabel>
        <Input defaultValue={values.taxId} name="taxId" />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Internal notes</FieldLabel>
        <Textarea defaultValue={values.notes} name="notes" rows={2} />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Reason</FieldLabel>
        <Textarea maxLength={500} name="reason" required rows={2} />
        <FieldDescription>
          Kept in the admin audit log; never shown to the customer.
        </FieldDescription>
      </Field>
      <div className="sm:col-span-2">
        <FormError message={state?.ok ? null : state?.error} />
      </div>
      <div className="sm:col-span-2">
        <Button loading={pending} type="submit">
          Save billing settings
        </Button>
      </div>
    </form>
  );
}
