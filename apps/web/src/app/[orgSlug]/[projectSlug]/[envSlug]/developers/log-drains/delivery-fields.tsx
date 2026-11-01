"use client";

import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { LOG_DRAIN_FORMATS, type LogDrainFormat } from "@coss/webhooks/schemas";
import { useState } from "react";
import { AUTH_KIND_LABELS, type AuthKind, FORMAT_LABELS } from "./presets";

function SimpleSelect<T extends string>(props: {
  label: string;
  name?: string;
  items: { value: T; label: string }[];
  value: T;
  onValueChange: (value: T) => void;
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select
        items={props.items}
        name={props.name}
        onValueChange={(value) => {
          if (value !== null) props.onValueChange(value as T);
        }}
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
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

export function PresetSelect(props: {
  presets: { id: string; label: string }[];
  value: string;
  onValueChange: (id: string) => void;
}) {
  return (
    <SimpleSelect
      description="Fills in the format and how the drain authenticates."
      items={props.presets.map((preset) => ({ value: preset.id, label: preset.label }))}
      label="Destination"
      onValueChange={props.onValueChange}
      value={props.value}
    />
  );
}

export function FormatSelect(props: { defaultValue: LogDrainFormat }) {
  const [format, setFormat] = useState(props.defaultValue);
  return (
    <SimpleSelect
      description={FORMAT_LABELS[format].description}
      items={LOG_DRAIN_FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value].label }))}
      label="Format"
      name="format"
      onValueChange={setFormat}
      value={format}
    />
  );
}

/**
 * How the drain authenticates, as the `auth*` fields `authHeaderFromForm` reads. With
 * `currentHeaderName` (editing a drain that has one), `keep` leaves it as it is.
 */
export function AuthFields(props: {
  defaultKind: AuthKind | "keep";
  defaultHeaderName?: string;
  currentHeaderName?: string | null;
  basicLabels?: { user: string; password: string };
  help?: string;
}) {
  const [kind, setKind] = useState(props.defaultKind);
  const items: { value: AuthKind | "keep"; label: string }[] = [
    ...(props.currentHeaderName
      ? [{ value: "keep" as const, label: `Keep the current ${props.currentHeaderName} header` }]
      : []),
    ...(Object.keys(AUTH_KIND_LABELS) as AuthKind[]).map((value) => ({
      value,
      label:
        value === "none" && props.currentHeaderName ? "None (remove it)" : AUTH_KIND_LABELS[value],
    })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <SimpleSelect
        description="Sent with every batch. Values are stored encrypted and never shown again."
        items={items}
        label="Authentication"
        name="authKind"
        onValueChange={setKind}
        value={kind}
      />
      {kind === "bearer" ? (
        <Field>
          <FieldLabel>Token</FieldLabel>
          <Input autoComplete="off" name="authToken" required type="password" />
          {props.help ? <FieldDescription>{props.help}</FieldDescription> : null}
        </Field>
      ) : null}
      {kind === "basic" ? (
        <>
          <Field>
            <FieldLabel>{props.basicLabels?.user ?? "User"}</FieldLabel>
            <Input autoComplete="off" name="authUser" required />
          </Field>
          <Field>
            <FieldLabel>{props.basicLabels?.password ?? "Password"}</FieldLabel>
            <Input autoComplete="off" name="authPassword" required type="password" />
            {props.help ? <FieldDescription>{props.help}</FieldDescription> : null}
          </Field>
        </>
      ) : null}
      {kind === "header" ? (
        <>
          <Field>
            <FieldLabel>Header</FieldLabel>
            <Input
              autoComplete="off"
              defaultValue={props.defaultHeaderName}
              maxLength={128}
              name="authHeaderName"
              placeholder="Authorization"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Value</FieldLabel>
            <Input autoComplete="off" name="authHeaderValue" required type="password" />
            {props.help ? <FieldDescription>{props.help}</FieldDescription> : null}
          </Field>
        </>
      ) : null}
    </div>
  );
}
