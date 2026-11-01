"use client";

import { LOG_DRAIN_SOURCES, type LogDrainSource } from "@coss/logs/schemas";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Label } from "@coss/ui/components/label";
import { SOURCE_LABELS } from "./sources";

/** One checkbox per source; `selected` empty means every source. */
export function SourceCheckboxes(props: { selected?: readonly LogDrainSource[] }) {
  const selected = props.selected ?? [];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-medium text-sm">Sources</legend>
      {LOG_DRAIN_SOURCES.map((source) => (
        <Label className="items-start gap-3" key={source}>
          <Checkbox
            className="mt-0.5"
            defaultChecked={selected.length === 0 || selected.includes(source)}
            name="sources"
            value={source}
          />
          <span className="flex flex-col gap-0.5">
            {SOURCE_LABELS[source].label}
            <span className="font-normal text-muted-foreground text-xs">
              {SOURCE_LABELS[source].description}
            </span>
          </span>
        </Label>
      ))}
    </fieldset>
  );
}
