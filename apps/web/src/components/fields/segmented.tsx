"use client";

import { ToggleGroup, ToggleGroupItem } from "@coss/ui/components/toggle-group";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

export type SegmentedOption = { value: string; label: string; icon?: LucideIcon };

/**
 * Two to four choices side by side, one always chosen; posts the value under `name` like the
 * select it replaces.
 */
export function Segmented(props: {
  name?: string;
  options: SegmentedOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(props.defaultValue ?? props.options[0]?.value ?? "");
  const value = props.value ?? own;
  return (
    <>
      {props.name ? <input name={props.name} type="hidden" value={value} /> : null}
      <ToggleGroup
        aria-label={props["aria-label"]}
        disabled={props.disabled}
        onValueChange={(next) => {
          const chosen = next[0];
          if (typeof chosen !== "string") return;
          setOwn(chosen);
          props.onValueChange?.(chosen);
        }}
        value={[value]}
        variant="outline"
      >
        {props.options.map((option) => (
          <ToggleGroupItem
            className="px-[calc(--spacing(3)-1px)]"
            key={option.value}
            value={option.value}
          >
            {option.icon ? <option.icon /> : null}
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}
