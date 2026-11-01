"use client";

import type { SegmentConditionOutput, SegmentFilterOutput } from "@coss/email/contact-schemas";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
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
import { Textarea } from "@coss/ui/components/textarea";
import { PlusIcon, XIcon } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { deleteSegmentAction, previewSegmentAction, saveSegmentAction } from "./actions";

type PropertyType = "string" | "number" | "boolean" | "date";
type ConditionField = SegmentConditionOutput["field"];
type Row = {
  id: number;
  field: ConditionField;
  key: string;
  op: string;
  value: string;
  audienceId: string;
  topic: string;
};
type Option = { value: string; label: string };

const FIELDS: Option[] = [
  { value: "property", label: "Property" },
  { value: "email", label: "Email" },
  { value: "audience", label: "Audience" },
  { value: "topic", label: "Topic" },
  { value: "created_at", label: "Added" },
];

const PROPERTY_OPS: Record<PropertyType, Option[]> = {
  string: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "in", label: "is one of" },
    { value: "not_in", label: "is none of" },
    { value: "contains", label: "contains" },
    { value: "starts_with", label: "starts with" },
    { value: "exists", label: "is set" },
    { value: "not_exists", label: "is not set" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "in", label: "is one of" },
    { value: "not_in", label: "is none of" },
    { value: "exists", label: "is set" },
    { value: "not_exists", label: "is not set" },
  ],
  boolean: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
    { value: "exists", label: "is set" },
    { value: "not_exists", label: "is not set" },
  ],
  date: [
    { value: "gt", label: "is after" },
    { value: "gte", label: "is on or after" },
    { value: "lt", label: "is before" },
    { value: "lte", label: "is on or before" },
    { value: "exists", label: "is set" },
    { value: "not_exists", label: "is not set" },
  ],
};

const OTHER_OPS: Record<Exclude<ConditionField, "property">, Option[]> = {
  email: [
    { value: "eq", label: "is" },
    { value: "ends_with", label: "ends with" },
    { value: "contains", label: "contains" },
  ],
  audience: [
    { value: "in", label: "is in" },
    { value: "not_in", label: "is not in" },
  ],
  topic: [
    { value: "subscribed", label: "is subscribed to" },
    { value: "not_subscribed", label: "is not subscribed to" },
  ],
  created_at: [
    { value: "within_days", label: "in the last (days)" },
    { value: "after", label: "after" },
    { value: "before", label: "before" },
  ],
};

let nextId = 0;

function emptyRow(field: ConditionField = "email"): Row {
  return {
    id: nextId++,
    field,
    key: "",
    op: field === "property" ? "eq" : (OTHER_OPS[field][0]?.value ?? ""),
    value: "",
    audienceId: "",
    topic: "",
  };
}

function rowOf(condition: SegmentConditionOutput, types: ReadonlyMap<string, PropertyType>): Row {
  const row = emptyRow(condition.field);
  row.op = condition.op;
  switch (condition.field) {
    case "property": {
      row.key = condition.key;
      const value = condition.value === undefined ? "" : String(condition.value);
      // Only a date property's midnight is shown as the day (`typed` adds it back).
      row.value = Array.isArray(condition.value)
        ? condition.value.join(", ")
        : types.get(condition.key) === "date"
          ? value.replace(/T00:00:00\.000Z$/, "")
          : value;
      break;
    }
    case "email":
      row.value = condition.value;
      break;
    case "audience":
      row.audienceId = condition.audience_id;
      break;
    case "topic":
      row.topic = condition.topic;
      break;
    case "created_at":
      row.value = String(condition.value).slice(0, 10);
      break;
  }
  return row;
}

/**
 * Whether the builder's fields hold the condition exactly (saving it unchanged gives it back):
 * `created_at` dates only to the day, and lists as comma-separated text.
 */
function representable(condition: SegmentConditionOutput): boolean {
  if (condition.field === "created_at" && condition.op !== "within_days") {
    return /T00:00:00(\.0+)?Z$/.test(String(condition.value));
  }
  if (condition.field === "property" && Array.isArray(condition.value)) {
    return condition.value.every(
      (item) =>
        typeof item !== "string" || (item !== "" && item === item.trim() && !item.includes(",")),
    );
  }
  return true;
}

function typed(type: PropertyType, text: string): string | number | boolean {
  if (type === "number") return Number(text);
  if (type === "boolean") {
    // `true`/`false` in any case; anything else goes on as text, so the server refuses it.
    const lower = text.trim().toLowerCase();
    return lower === "true" ? true : lower === "false" ? false : text;
  }
  if (type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  return text;
}

function conditionOf(row: Row, types: ReadonlyMap<string, PropertyType>): unknown {
  switch (row.field) {
    case "property": {
      const type = types.get(row.key) ?? "string";
      if (row.op === "exists" || row.op === "not_exists") {
        return { field: "property", key: row.key, op: row.op };
      }
      const value =
        row.op === "in" || row.op === "not_in"
          ? row.value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part) => typed(type, part))
          : typed(type, row.value);
      return { field: "property", key: row.key, op: row.op, value };
    }
    case "email":
      return { field: "email", op: row.op, value: row.value.trim() };
    case "audience":
      return { field: "audience", op: row.op, audience_id: row.audienceId };
    case "topic":
      return { field: "topic", op: row.op, topic: row.topic };
    case "created_at":
      return {
        field: "created_at",
        op: row.op,
        value: row.op === "within_days" ? Number(row.value) : typed("date", row.value),
      };
  }
}

function SmallSelect(props: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Select
      disabled={props.disabled}
      items={props.options}
      onValueChange={(value) => {
        if (typeof value === "string") props.onChange(value);
      }}
      value={props.value || null}
    >
      <SelectTrigger aria-label={props.label} className="min-w-36" size="sm">
        <SelectValue placeholder={props.placeholder} />
      </SelectTrigger>
      <SelectPopup>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

/**
 * Edits a segment: its name and filter. Flat filters (one level of conditions) get the builder;
 * filters with nested groups or values it can't hold exactly (made through the API) are edited as
 * JSON.
 */
export function SegmentEditor(
  props: MarketingFormTarget & {
    segmentId?: string;
    name: string;
    filter: SegmentFilterOutput | null;
    properties: { key: string; type: PropertyType }[];
    audiences: Option[];
    topics: Option[];
    canEdit: boolean;
  },
) {
  // Nested groups, or values the builder would change, are edited as JSON.
  const nested =
    props.filter?.conditions.some(
      (item) => "conditions" in item || !representable(item as SegmentConditionOutput),
    ) ?? false;
  const [match, setMatch] = useState<"all" | "any">(props.filter?.match ?? "all");
  const types = useMemo(
    () => new Map(props.properties.map((property) => [property.key, property.type])),
    [props.properties],
  );
  const [rows, setRows] = useState<Row[]>(() =>
    props.filter && !nested
      ? props.filter.conditions.map((item) => rowOf(item as SegmentConditionOutput, types))
      : [emptyRow()],
  );
  const [json, setJson] = useState(() => JSON.stringify(props.filter, null, 2));
  const filterJson = nested
    ? json
    : JSON.stringify({ version: 1, match, conditions: rows.map((row) => conditionOf(row, types)) });
  const [saveState, saveAction, saving] = useActionState(saveSegmentAction, null);
  const [previewState, previewAction, previewing] = useActionState(previewSegmentAction, null);
  const disabled = !props.canEdit;
  const update = (id: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));

  return (
    <div className="flex flex-col gap-6">
      <form action={saveAction} className="flex flex-col gap-4">
        <TargetInputs {...props} />
        {props.segmentId ? <input name="segmentId" type="hidden" value={props.segmentId} /> : null}
        <input name="filter" type="hidden" value={filterJson} />
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            defaultValue={props.name}
            disabled={disabled}
            maxLength={200}
            name="name"
            required
          />
        </Field>
        {nested ? (
          <Field>
            <FieldLabel>Filter (JSON)</FieldLabel>
            <Textarea
              className="font-mono text-xs"
              disabled={disabled}
              onChange={(event) => setJson(event.target.value)}
              rows={14}
              value={json}
            />
            <FieldDescription>
              This filter has nested groups or values (exact times, list items with commas) the
              builder doesn't show. See the API reference for its shape.
            </FieldDescription>
          </Field>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              Contacts matching
              <SmallSelect
                disabled={disabled}
                label="Match"
                onChange={(value) => setMatch(value as "all" | "any")}
                options={[
                  { value: "all", label: "all" },
                  { value: "any", label: "any" },
                ]}
                value={match}
              />
              of these conditions:
            </div>
            {rows.map((row) => {
              const type = types.get(row.key) ?? "string";
              const ops = row.field === "property" ? PROPERTY_OPS[type] : OTHER_OPS[row.field];
              const needsValue =
                (row.field === "property" && row.op !== "exists" && row.op !== "not_exists") ||
                row.field === "email" ||
                row.field === "created_at";
              return (
                <div className="flex flex-wrap items-center gap-2" key={row.id}>
                  <SmallSelect
                    disabled={disabled}
                    label="Field"
                    onChange={(field) =>
                      update(row.id, { ...emptyRow(field as ConditionField), id: row.id })
                    }
                    options={FIELDS}
                    value={row.field}
                  />
                  {row.field === "property" ? (
                    <SmallSelect
                      disabled={disabled}
                      label="Property"
                      onChange={(key) =>
                        update(row.id, {
                          key,
                          op: PROPERTY_OPS[types.get(key) ?? "string"][0]?.value ?? "eq",
                        })
                      }
                      options={props.properties.map((p) => ({ value: p.key, label: p.key }))}
                      placeholder="Choose a property"
                      value={row.key}
                    />
                  ) : null}
                  <SmallSelect
                    disabled={disabled}
                    label="Operator"
                    onChange={(op) => update(row.id, { op })}
                    options={ops}
                    value={row.op}
                  />
                  {row.field === "audience" ? (
                    <SmallSelect
                      disabled={disabled}
                      label="Audience"
                      onChange={(audienceId) => update(row.id, { audienceId })}
                      options={props.audiences}
                      placeholder="Choose an audience"
                      value={row.audienceId}
                    />
                  ) : null}
                  {row.field === "topic" ? (
                    <SmallSelect
                      disabled={disabled}
                      label="Topic"
                      onChange={(topic) => update(row.id, { topic })}
                      options={props.topics}
                      placeholder="Choose a topic"
                      value={row.topic}
                    />
                  ) : null}
                  {needsValue ? (
                    <Input
                      aria-label="Value"
                      className="w-56"
                      disabled={disabled}
                      onChange={(event) => update(row.id, { value: event.target.value })}
                      placeholder={
                        row.op === "in" || row.op === "not_in"
                          ? "a, b, c"
                          : row.field === "created_at" && row.op !== "within_days"
                            ? "2026-10-10"
                            : type === "boolean"
                              ? "true or false"
                              : type === "date"
                                ? "2026-10-10"
                                : ""
                      }
                      size="sm"
                      type={
                        row.field === "created_at" && row.op === "within_days" ? "number" : "text"
                      }
                      value={row.value}
                    />
                  ) : null}
                  {props.canEdit && rows.length > 1 ? (
                    <Button
                      aria-label="Remove condition"
                      onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon />
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {props.canEdit ? (
              <div>
                <Button
                  onClick={() => setRows((current) => [...current, emptyRow()])}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon />
                  Add condition
                </Button>
              </div>
            ) : null}
          </div>
        )}
        {saveState && !saveState.ok ? <FormError message={saveState.error} /> : null}
        {props.canEdit ? (
          <div>
            <Button loading={saving} type="submit">
              {props.segmentId ? "Save segment" : "Create segment"}
            </Button>
          </div>
        ) : null}
      </form>
      <form action={previewAction} className="flex flex-col gap-2">
        <TargetInputs {...props} />
        <input name="filter" type="hidden" value={filterJson} />
        <div>
          <Button loading={previewing} size="sm" type="submit" variant="outline">
            Preview matches
          </Button>
        </div>
        {previewState?.ok ? (
          <p className="text-muted-foreground text-sm">
            {previewState.data.count.toLocaleString("en-US")}{" "}
            {previewState.data.count === 1 ? "contact matches" : "contacts match"} now
            {previewState.data.sample.length > 0
              ? `, e.g. ${previewState.data.sample.slice(0, 5).join(", ")}`
              : ""}
            . Broadcasts reach only the subscribed ones.
          </p>
        ) : null}
        {previewState && !previewState.ok ? <FormError message={previewState.error} /> : null}
      </form>
    </div>
  );
}

export function DeleteSegmentButton(
  props: MarketingFormTarget & { segmentId: string; name: string },
) {
  const [state, formAction, pending] = useActionState(deleteSegmentAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete segment
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="segmentId" type="hidden" value={props.segmentId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its contacts stay; only the filter goes.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete segment
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
