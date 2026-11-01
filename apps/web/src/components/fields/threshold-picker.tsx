"use client";

import { Button } from "@coss/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@coss/ui/components/input-group";
import { cn } from "@coss/ui/lib/utils";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

function parse(text: string | undefined): number[] {
  return (text ?? "")
    .split(",")
    .map((value) => Number(value.trim().replace(/%$/, "")))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/**
 * Percentages to be alerted at, as toggles on a bar that shows where each one falls. Posts them as
 * "50, 80, 100" under `name`; at least one stays chosen.
 */
export function ThresholdPicker(props: {
  name: string;
  defaultValue?: string;
  presets?: number[];
  max?: number;
}) {
  const max = props.max ?? 1000;
  const [chosen, setChosen] = useState(() => {
    const initial = parse(props.defaultValue);
    return new Set(initial.length ? initial : [80, 100]);
  });
  const [options, setOptions] = useState(() =>
    [...new Set([...(props.presets ?? [50, 75, 80, 90, 100]), ...chosen])].sort((a, b) => a - b),
  );
  const [custom, setCustom] = useState("");
  const sorted = [...chosen].sort((a, b) => a - b);
  const scale = Math.max(100, ...sorted);

  const toggle = (value: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        if (next.size > 1) next.delete(value);
      } else next.add(value);
      return next;
    });

  const customValue = Number(custom);
  const customValid = Number.isInteger(customValue) && customValue >= 1 && customValue <= max;
  const addCustom = () => {
    if (!customValid) return;
    setOptions((current) => [...new Set([...current, customValue])].sort((a, b) => a - b));
    setChosen((current) => new Set([...current, customValue]));
    setCustom("");
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <input name={props.name} type="hidden" value={sorted.join(", ")} />
      <div aria-hidden className="relative pt-5 pb-1">
        <div className="relative h-2 overflow-hidden rounded-full bg-muted bg-linear-to-b from-foreground/6 to-transparent">
          <div
            className="absolute inset-y-0 left-0 bg-linear-to-r from-transparent to-foreground/12 transition-[width] duration-300 ease-out"
            style={{ width: `${(100 / scale) * 100}%` }}
          />
        </div>
        {sorted.map((value) => (
          <span
            className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1 transition-[left] duration-300 ease-out"
            key={value}
            style={{ left: `${(value / scale) * 100}%` }}
          >
            <span className="font-mono text-[0.625rem] text-muted-foreground tabular-nums leading-none">
              {value}%
            </span>
            <span className="h-3 w-0.5 rounded-full bg-foreground shadow-[0_0_0_2px_var(--popover)]" />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((value) => {
          const on = chosen.has(value);
          return (
            <Button
              aria-pressed={on}
              className={cn("rounded-full font-mono tabular-nums", !on && "text-muted-foreground")}
              key={value}
              onClick={() => toggle(value)}
              size="xs"
              type="button"
              variant={on ? "default" : "outline"}
            >
              {value}%
            </Button>
          );
        })}
        <InputGroup className="w-24">
          <InputGroupInput
            aria-label="Another percentage"
            className="font-mono tabular-nums"
            inputMode="numeric"
            onChange={(event) => setCustom(event.currentTarget.value.replace(/\D/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="Other"
            size="sm"
            value={custom}
          />
          <InputGroupAddon align="inline-end">
            {customValid ? (
              <Button
                aria-label="Add"
                onClick={addCustom}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <PlusIcon />
              </Button>
            ) : (
              <InputGroupText className="text-muted-foreground text-xs">%</InputGroupText>
            )}
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
