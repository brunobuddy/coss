"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { useActionState, useState } from "react";
import { DateField } from "@/components/fields/date-field";
import { Segmented } from "@/components/fields/segmented";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { contactAudienceAction, setContactTopicAction, updateContactAction } from "../actions";

type Property = { key: string; type: "string" | "number" | "boolean" | "date" };

const STATUSES = [
  { value: "subscribed", label: "Subscribed" },
  { value: "unsubscribed", label: "Unsubscribed" },
];

const UNSET = "unset";
const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?Z$/;

/** Yes / No / Not set, posted as "true" / "false" / "" (a toggle can't carry an empty value). */
function BooleanInput(props: {
  name: string;
  defaultValue: string;
  disabled: boolean;
  label: string;
}) {
  const [value, setValue] = useState(
    props.defaultValue === "true" || props.defaultValue === "false" ? props.defaultValue : UNSET,
  );
  return (
    <div>
      <input name={props.name} type="hidden" value={value === UNSET ? "" : value} />
      <Segmented
        aria-label={props.label}
        disabled={props.disabled}
        onValueChange={setValue}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
          { value: UNSET, label: "Not set" },
        ]}
        value={value}
      />
    </div>
  );
}

/** One custom property's field, in the control its type calls for. */
function PropertyInput(props: {
  definition: Property;
  value: string | number | boolean | undefined;
  disabled: boolean;
}) {
  const { definition, value, disabled } = props;
  const name = `property:${definition.key}`;
  const text = value === undefined ? "" : String(value);
  if (definition.type === "boolean") {
    return (
      <BooleanInput defaultValue={text} disabled={disabled} label={definition.key} name={name} />
    );
  }
  // Dates are stored as full timestamps; only a day's midnight fits the calendar.
  const day =
    definition.type === "date" ? (text === "" ? "" : MIDNIGHT.exec(text)?.[1]) : undefined;
  if (day !== undefined && !disabled) {
    return <DateField defaultValue={day} name={name} placeholder="Not set" />;
  }
  return (
    <Input
      defaultValue={text}
      disabled={disabled}
      name={name}
      placeholder={definition.type === "date" ? "2026-10-10" : "Empty"}
      step={definition.type === "number" ? "any" : undefined}
      type={definition.type === "number" ? "number" : "text"}
    />
  );
}

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
          <div>
            <Segmented
              aria-label="Status"
              defaultValue={props.status}
              disabled={disabled}
              name="status"
              options={STATUSES}
            />
          </div>
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
                <PropertyInput definition={definition} disabled={disabled} value={value} />
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
