"use client";

import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Textarea } from "@coss/ui/components/textarea";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { saveBroadcastAction } from "./actions";

type Option = { value: string; label: string };

export type BroadcastDraft = {
  name: string;
  target: string;
  topic: string;
  from: string;
  replyTo: string;
  subject: string;
  previewText: string;
  html: string;
  text: string;
  trackOpens: boolean;
  trackClicks: boolean;
  ratePerSecond: string;
};

export const EMPTY_DRAFT: BroadcastDraft = {
  name: "",
  target: "",
  topic: "",
  from: "",
  replyTo: "",
  subject: "",
  previewText: "",
  html: "",
  text: "",
  trackOpens: true,
  trackClicks: true,
  ratePerSecond: "",
};

const NO_TOPIC = "__none";

/**
 * A broadcast's content and target. Editable while it is a draft; read-only afterwards (its
 * content is frozen once it starts sending).
 */
export function BroadcastEditor(
  props: MarketingFormTarget & {
    broadcastId?: string;
    draft: BroadcastDraft;
    audiences: Option[];
    segments: Option[];
    topics: Option[];
    /** Contact fields and custom properties a template can use. */
    variables: string[];
    planRate: number;
    canEdit: boolean;
  },
) {
  const [state, formAction, pending] = useActionState(saveBroadcastAction, null);
  const [target, setTarget] = useState(props.draft.target);
  const [topic, setTopic] = useState(props.draft.topic || NO_TOPIC);
  const disabled = !props.canEdit;
  const targets = [
    ...props.audiences.map((option) => ({ ...option, group: "Audiences" })),
    ...props.segments.map((option) => ({ ...option, group: "Segments" })),
  ];
  const topics = [{ value: NO_TOPIC, label: "No topic" }, ...props.topics];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TargetInputs {...props} />
      {props.broadcastId ? (
        <input name="broadcastId" type="hidden" value={props.broadcastId} />
      ) : null}
      <input name="target" type="hidden" value={target} />
      <input name="topic" type="hidden" value={topic === NO_TOPIC ? "" : topic} />
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input
          defaultValue={props.draft.name}
          disabled={disabled}
          maxLength={200}
          name="name"
          placeholder="October newsletter"
          required
        />
        <FieldDescription>Only shown to you.</FieldDescription>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>Send to</FieldLabel>
          <Select
            disabled={disabled}
            items={targets}
            onValueChange={(value) => {
              if (typeof value === "string") setTarget(value);
            }}
            value={target || null}
          >
            <SelectTrigger aria-label="Send to">
              <SelectValue placeholder="An audience or a segment" />
            </SelectTrigger>
            <SelectPopup>
              {props.audiences.length > 0 ? (
                <SelectGroup>
                  <SelectGroupLabel>Audiences</SelectGroupLabel>
                  {props.audiences.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {props.segments.length > 0 ? (
                <SelectGroup>
                  <SelectGroupLabel>Segments</SelectGroupLabel>
                  {props.segments.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectPopup>
          </Select>
          <FieldDescription>
            Only subscribed contacts who aren't suppressed get it.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Topic</FieldLabel>
          <Select
            disabled={disabled}
            items={topics}
            onValueChange={(value) => {
              if (typeof value === "string") setTopic(value);
            }}
            value={topic}
          >
            <SelectTrigger aria-label="Topic">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {topics.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>
            Only contacts the topic reaches get it; its unsubscribe link leaves just this topic.
          </FieldDescription>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>From</FieldLabel>
          <Input
            defaultValue={props.draft.from}
            disabled={disabled}
            name="from"
            placeholder="Acme <news@acme.com>"
            required
          />
        </Field>
        <Field>
          <FieldLabel>Reply to</FieldLabel>
          <Input
            defaultValue={props.draft.replyTo}
            disabled={disabled}
            name="replyTo"
            placeholder="Optional, comma-separated"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>Subject</FieldLabel>
        <Input
          defaultValue={props.draft.subject}
          disabled={disabled}
          maxLength={998}
          name="subject"
          placeholder="What's new, {{{contact.first_name|there}}}"
          required
        />
      </Field>
      <Field>
        <FieldLabel>Preview text</FieldLabel>
        <Input
          defaultValue={props.draft.previewText}
          disabled={disabled}
          maxLength={500}
          name="previewText"
          placeholder="The line inboxes show after the subject"
        />
      </Field>
      <Field>
        <FieldLabel>HTML</FieldLabel>
        <Textarea
          className="font-mono text-xs"
          defaultValue={props.draft.html}
          disabled={disabled}
          name="html"
          placeholder={"<p>Hi {{{contact.first_name|there}}},</p>"}
          rows={14}
        />
      </Field>
      <Field>
        <FieldLabel>Plain text</FieldLabel>
        <Textarea
          className="font-mono text-xs"
          defaultValue={props.draft.text}
          disabled={disabled}
          name="text"
          placeholder="Optional: the text version"
          rows={5}
        />
      </Field>
      <div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground text-xs leading-relaxed">
        <p className="mb-1 font-medium text-foreground">Variables</p>
        <p className="font-mono">
          {props.variables.map((key) => `{{{contact.${key}|fallback}}}`).join("  ")}
        </p>
        <p className="mt-1 font-mono">
          {"{{{unsubscribe_url}}}  {{{preferences_url}}}  {{{mailing_address}}}"}
        </p>
        <p className="mt-1">
          Contact values are escaped in HTML. Without the unsubscribe link or the postal address,
          coss.com adds a footer with them.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <Label>
          <Checkbox
            defaultChecked={props.draft.trackOpens}
            disabled={disabled}
            name="trackOpens"
            value="on"
          />
          Track opens
        </Label>
        <Label>
          <Checkbox
            defaultChecked={props.draft.trackClicks}
            disabled={disabled}
            name="trackClicks"
            value="on"
          />
          Track clicks
        </Label>
      </div>
      <Field className="max-w-xs">
        <FieldLabel>Recipients per second</FieldLabel>
        <Input
          defaultValue={props.draft.ratePerSecond}
          disabled={disabled}
          max={props.planRate}
          min={1}
          name="ratePerSecond"
          placeholder={`${props.planRate} (your plan's rate)`}
          type="number"
        />
        <FieldDescription>At most your plan's marketing rate.</FieldDescription>
      </Field>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canEdit ? (
        <div>
          <Button loading={pending} type="submit">
            {props.broadcastId ? "Save draft" : "Create draft"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
