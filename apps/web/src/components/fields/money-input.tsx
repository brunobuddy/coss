"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@coss/ui/components/input-group";
import { cn } from "@coss/ui/lib/utils";
import { type ComponentProps, useState } from "react";

const AMOUNT = /^\d[\d,]*(?:\.\d*)?$|^\.\d+$/;

/** "1250.5" → "1,250.50"; anything that isn't an amount stays as typed (the action rejects it). */
export function formatDollars(text: string): string {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!AMOUNT.test(trimmed)) return text;
  const [whole = "0", fraction] = trimmed.replaceAll(",", "").split(".");
  const grouped = BigInt(whole || "0").toLocaleString("en-US");
  if (fraction === undefined || fraction === "") return grouped;
  return `${grouped}.${fraction.length === 1 ? `${fraction}0` : fraction}`;
}

/**
 * A dollar amount: `$` before it, the currency after, grouped as it's left ("1,250.50"). Posts the
 * text as shown, which `parseDollarsToCents` reads (commas included).
 */
export function MoneyInput(
  props: Omit<ComponentProps<typeof InputGroupInput>, "type" | "inputMode" | "value"> & {
    currency?: string;
    defaultValue?: string;
    groupClassName?: string;
  },
) {
  const { currency = "USD", defaultValue, groupClassName, onBlur, ...input } = props;
  const [value, setValue] = useState(defaultValue ? formatDollars(defaultValue) : "");
  return (
    <InputGroup className={cn("font-mono", groupClassName)}>
      <InputGroupAddon>
        <InputGroupText className="text-muted-foreground">$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        {...input}
        autoComplete="off"
        className={cn("tabular-nums", input.className)}
        inputMode="decimal"
        onBlur={(event) => {
          setValue(formatDollars(event.currentTarget.value));
          onBlur?.(event);
        }}
        onChange={(event) => setValue(event.currentTarget.value)}
        value={value}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className="text-muted-foreground text-xs">{currency}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
