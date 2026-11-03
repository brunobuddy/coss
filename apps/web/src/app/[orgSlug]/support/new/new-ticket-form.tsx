"use client";

import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useState } from "react";
import { SupportComposer } from "@/components/support/composer";
import type { ActionResult } from "@/lib/action-result";
import { createTicketAction } from "../actions";

type Expectation = { target: string; by: string };

export function NewTicketForm(props: {
  orgSlug: string;
  from: string;
  categories: { value: string; label: string }[];
  defaultCategory: string;
  defaultSubject: string;
  canBeUrgent: boolean;
  expectations: Record<"normal" | "urgent", Expectation>;
}) {
  const [subject, setSubject] = useState(props.defaultSubject);
  const [category, setCategory] = useState(props.defaultCategory);
  const [severity, setSeverity] = useState<"normal" | "urgent">("normal");
  const expected = props.expectations[severity];

  async function submit(previous: ActionResult<null> | null, formData: FormData) {
    formData.set("subject", subject);
    formData.set("category", category);
    formData.set("severity", severity);
    return createTicketAction(previous, formData);
  }

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <FieldLabel>Subject</FieldLabel>
        <Input
          maxLength={200}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="What do you need help with?"
          required
          value={subject}
        />
      </Field>
      <Field>
        <FieldLabel>Topic</FieldLabel>
        <Select
          items={props.categories}
          onValueChange={(value) => setCategory(String(value))}
          value={category}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {props.categories.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </Field>
      {props.canBeUrgent ? (
        <Field>
          <FieldLabel>How urgent is it?</FieldLabel>
          <RadioGroup
            onValueChange={(value) => setSeverity(value as "normal" | "urgent")}
            value={severity}
          >
            <Label className="flex items-center gap-2 font-normal">
              <Radio value="normal" />
              Normal
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Radio value="urgent" />
              Urgent: production is down
            </Label>
          </RadioGroup>
          <FieldDescription>We may reclassify a ticket when we read it.</FieldDescription>
        </Field>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Our target is {expected.target}: expect a reply by {expected.by}.
      </p>
      <SupportComposer
        action={submit}
        draftKey={`support-draft:new:${props.orgSlug}`}
        hidden={{ orgSlug: props.orgSlug, from: props.from }}
        modes={[
          {
            value: "reply",
            label: "Message",
            placeholder:
              "What happened, what you expected, and any ids or errors you saw. Please leave out passwords and API keys.",
          },
        ]}
        sendLabel={() => "Send ticket"}
        success={() => "Ticket sent"}
      />
    </div>
  );
}
