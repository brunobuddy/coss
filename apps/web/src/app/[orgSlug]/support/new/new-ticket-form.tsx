"use client";

import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@coss/ui/components/autocomplete";
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
import { useEffect, useState } from "react";
import { clearSupportDraft, SupportComposer } from "@/components/support/composer";
import type { ActionResult } from "@/lib/action-result";
import { toast } from "@/lib/toast";
import { createTicketAction } from "../actions";

type Expectation = { target: string; by: string };
type Option = { value: string; label: string };
type ReferenceOption = { id: string; label: string; detail: string };

const NONE = "none";

function SelectField(props: {
  label: string;
  items: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select
        items={props.items}
        onValueChange={(value) => props.onChange(String(value))}
        value={props.value}
      >
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
    </Field>
  );
}

/** Recent items of the chosen project and product, or any id pasted in. */
function ReferenceField(props: {
  orgSlug: string;
  environmentId: string;
  product: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [items, setItems] = useState<ReferenceOption[]>([]);
  useEffect(() => {
    setItems([]);
    if (props.environmentId === NONE || props.product === NONE) return;
    const params = new URLSearchParams({
      environmentId: props.environmentId,
      product: props.product,
    });
    let current = true;
    fetch(`/${props.orgSlug}/support/references?${params}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((body: { items: ReferenceOption[] }) => {
        if (current) setItems(body.items);
      })
      .catch(() => {
        // The field still takes a pasted id.
      });
    return () => {
      current = false;
    };
  }, [props.orgSlug, props.environmentId, props.product]);

  return (
    <Field>
      <FieldLabel>Related item (optional)</FieldLabel>
      <Autocomplete
        filter={(item: ReferenceOption, query) => {
          const search = query.trim().toLowerCase();
          return `${item.id} ${item.label} ${item.detail}`.toLowerCase().includes(search);
        }}
        itemToStringValue={(item: ReferenceOption) => item.id}
        items={items}
        onValueChange={props.onChange}
        openOnInputClick={items.length > 0}
        value={props.value}
      >
        <AutocompleteInput
          placeholder={items.length > 0 ? "Search recent items, or paste an ID" : "Paste an ID"}
        />
        {items.length > 0 ? (
          <AutocompletePopup>
            <AutocompleteEmpty>
              None of the recent items match. You can paste an ID.
            </AutocompleteEmpty>
            <AutocompleteList>
              {(item: ReferenceOption) => (
                <AutocompleteItem key={item.id} value={item}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.label}</span>
                    <span className="truncate font-mono text-muted-foreground text-xs">
                      {item.detail ? `${item.detail} · ` : ""}
                      {item.id}
                    </span>
                  </span>
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        ) : null}
      </Autocomplete>
      <FieldDescription>
        An email, text message, domain or anything else with an ID, like email_01k…
      </FieldDescription>
    </Field>
  );
}

export function NewTicketForm(props: {
  orgSlug: string;
  from: string;
  categories: Option[];
  defaultCategory: string;
  defaultSubject: string;
  environments: Option[];
  defaultEnvironmentId: string | null;
  products: Option[];
  defaultProduct: string | null;
  defaultReference: string;
  canBeUrgent: boolean;
  expectations: Record<"normal" | "urgent", Expectation>;
}) {
  const [subject, setSubject] = useState(props.defaultSubject);
  const [category, setCategory] = useState(props.defaultCategory);
  const [severity, setSeverity] = useState<"normal" | "urgent">("normal");
  const [environmentId, setEnvironmentId] = useState(props.defaultEnvironmentId ?? NONE);
  const [product, setProduct] = useState(props.defaultProduct ?? NONE);
  const [reference, setReference] = useState(props.defaultReference);
  const expected = props.expectations[severity];
  const draftKey = `support-draft:new:${props.orgSlug}`;

  async function submit(previous: ActionResult<null> | null, formData: FormData) {
    formData.set("subject", subject);
    formData.set("category", category);
    formData.set("severity", severity);
    formData.set("environmentId", environmentId === NONE ? "" : environmentId);
    formData.set("product", product === NONE ? "" : product);
    formData.set("reference", reference);
    try {
      return await createTicketAction(previous, formData);
    } catch (error) {
      // Only a redirect gets here (failures come back as a result): the ticket exists.
      clearSupportDraft(draftKey);
      toast.success("Ticket sent");
      throw error;
    }
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
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          items={props.categories}
          label="Topic"
          onChange={setCategory}
          value={category}
        />
        <SelectField
          items={[{ value: NONE, label: "Not a specific product" }, ...props.products]}
          label="Product"
          onChange={setProduct}
          value={product}
        />
      </div>
      <SelectField
        items={[{ value: NONE, label: "Not a specific project" }, ...props.environments]}
        label="Project"
        onChange={setEnvironmentId}
        value={environmentId}
      />
      <ReferenceField
        environmentId={environmentId}
        onChange={setReference}
        orgSlug={props.orgSlug}
        product={product}
        value={reference}
      />
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
        draftKey={draftKey}
        hidden={{ orgSlug: props.orgSlug, from: props.from }}
        modes={[
          {
            value: "reply",
            label: "Message",
            placeholder:
              "What happened, what you expected, and any errors you saw. Please leave out passwords and API keys.",
          },
        ]}
        sendLabel={() => "Send ticket"}
        success={() => "Ticket sent"}
      />
    </div>
  );
}
