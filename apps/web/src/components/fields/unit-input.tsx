"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@coss/ui/components/input-group";
import { cn } from "@coss/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/** A number with its unit beside it ("100 per second", "30 days", "25 %"). */
export function UnitInput(
  props: Omit<ComponentProps<typeof InputGroupInput>, "type"> & {
    unit: ReactNode;
    prefix?: ReactNode;
    groupClassName?: string;
  },
) {
  const { unit, prefix, groupClassName, className, ...input } = props;
  return (
    <InputGroup className={groupClassName}>
      {prefix ? (
        <InputGroupAddon>
          <InputGroupText className="text-muted-foreground">{prefix}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupInput
        inputMode="numeric"
        type="number"
        {...input}
        className={cn("tabular-nums [&::-webkit-inner-spin-button]:appearance-none", className)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText className="text-muted-foreground text-xs">{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
