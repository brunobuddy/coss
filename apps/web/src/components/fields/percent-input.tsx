"use client";

import { useState } from "react";
import { UnitInput } from "./unit-input";

function toPercent(fraction: string | number | undefined): string {
  if (fraction === undefined || fraction === "") return "";
  const value = Number(fraction);
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 10) : "";
}

/**
 * A score the action takes as a fraction (0.8) shown as a percentage (80 %). Empty posts "" (off,
 * where the action allows it).
 */
export function PercentInput(props: {
  name: string;
  defaultValue?: string | number;
  min?: number;
  max?: number;
  placeholder?: string;
  required?: boolean;
  id?: string;
}) {
  const [percent, setPercent] = useState(() => toPercent(props.defaultValue));
  const fraction = percent === "" ? "" : String(Number(percent) / 100);
  return (
    <>
      <input name={props.name} type="hidden" value={fraction} />
      <UnitInput
        groupClassName="max-w-40"
        id={props.id}
        inputMode="decimal"
        max={(props.max ?? 1) * 100}
        min={(props.min ?? 0) * 100}
        onChange={(event) => setPercent(event.currentTarget.value)}
        placeholder={props.placeholder}
        required={props.required}
        step={1}
        unit="%"
        value={percent}
      />
    </>
  );
}
