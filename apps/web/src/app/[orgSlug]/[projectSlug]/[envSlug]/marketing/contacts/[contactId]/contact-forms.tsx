"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { contactAudienceAction, setContactTopicAction, updateContactAction } from "../actions";

type Property = { key: string; type: "string" | "number" | "boolean" | "date" };

const STATUSES = [
  { value: "subscribed", label: "Subscribed" },
  { value: "unsubscribed", label: "Unsubscribed" },
];

/** Names, status and custom properties of a contact (read-only without `contact:update`). */
export function ContactForm(
  props: MarketingFormTarget & {
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    status: "subscribed" | "unsubscribed" | "pending";
    properties: Record<string, string | number | boolean>;
    definitions: Property[];
    canEdit: boolean;
  },
) {
  const [state, formAction, pending] = useActionState(updateContactAction, null);
  const disabled = !props.canEdit;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TargetInputs {...props} />
      <input name="contactId" type="hidden" value={props.contactId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>First name</FieldLabel>
          <Input defaultValue={props.firstName ?? ""} disabled={disabled} name="firstName" />
        </Field>
        <Field>
          <FieldLabel>Last name</FieldLabel>
          <Input defaultValue={props.lastName ?? ""} disabled={disabled} name="lastName" />
        </Field>
      </div>
      {props.status === "pending" ? (
        <p className="text-muted-foreground text-sm">
          Waiting for the contact to confirm their subscription.
        </p>
      ) : (
        <Field>
          <FieldLabel>Status</FieldLabel>
          <Select defaultValue={props.status} disabled={disabled} items={STATUSES} name="status">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>
            Unsubscribed contacts get no marketing email. Re-subscribe someone only when they asked
            you to.
          </FieldDescription>
        </Field>
      )}
      {props.definitions.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {props.definitions.map((definition) => {
            const value = Object.hasOwn(props.properties, definition.key)
              ? props.properties[definition.key]
              : undefined;
            return (
              <Field key={definition.key}>
                <FieldLabel>
                  <code>{definition.key}</code>
                </FieldLabel>
                <Input
                  defaultValue={value === undefined ? "" : String(value)}
                  disabled={disabled}
                  inputMode={definition.type === "number" ? "decimal" : undefined}
                  name={`property:${definition.key}`}
                  placeholder={
                    definition.type === "boolean"
                      ? "true or false"
                      : definition.type === "date"
                        ? "2026-10-10"
                        : "Empty"
                  }
                />
              </Field>
            );
          })}
        </div>
      ) : null}
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canEdit ? (
        <div>
          <Button loading={pending} type="submit">
            Save contact
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Opts the contact in or out of one topic. */
export function TopicChoiceButton(
  props: MarketingFormTarget & {
    contactId: string;
    topic: string;
    subscribed: boolean;
  },
) {
  const [state, formAction, pending] = useActionState(setContactTopicAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <TargetInputs {...props} />
      <input name="contactId" type="hidden" value={props.contactId} />
      <input name="topic" type="hidden" value={props.topic} />
      <input name="status" type="hidden" value={props.subscribed ? "opted_out" : "opted_in"} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        {props.subscribed ? "Opt out" : "Opt in"}
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

/** Adds the contact to an audience, or removes it from one. */
export function AudienceMembershipButton(
  props: MarketingFormTarget & { contactId: string; audienceId: string; member: boolean },
) {
  const [state, formAction, pending] = useActionState(contactAudienceAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <TargetInputs {...props} />
      <input name="contactId" type="hidden" value={props.contactId} />
      <input name="audienceId" type="hidden" value={props.audienceId} />
      <input name="intent" type="hidden" value={props.member ? "remove" : "add"} />
      <Button loading={pending} size="xs" type="submit" variant="outline">
        {props.member ? "Remove" : "Add"}
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
