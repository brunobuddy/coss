"use client";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@coss/ui/components/combobox";
import { useMemo } from "react";

type Zone = { value: string; label: string };

function offsetOf(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "Los Angeles (GMT-8)", as it stands right now. */
export function zoneLabel(zone: string, now = new Date()): string {
  const place = zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone;
  const offset = offsetOf(zone, now);
  return offset ? `${place} (${offset})` : place;
}

/** Every zone the browser knows, and the current one whichever: the API may hold a newer name. */
function zonesWith(current: string): Zone[] {
  const now = new Date();
  const names = new Set(Intl.supportedValuesOf("timeZone"));
  names.add(current);
  return [...names].map((name) => ({ value: name, label: zoneLabel(name, now) }));
}

export function TimeZonePicker(props: {
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { value, onChange, disabled, id } = props;
  const zones = useMemo(() => zonesWith(value), [value]);
  const selected = zones.find((zone) => zone.value === value) ?? null;
  return (
    <Combobox
      disabled={disabled ?? false}
      items={zones}
      limit={100}
      onValueChange={(next: Zone | null) => {
        if (next) onChange(next.value);
      }}
      value={selected}
    >
      <ComboboxInput
        {...(id ? { id } : {})}
        aria-label="Time zone"
        placeholder="Search for a city"
        size="sm"
      />
      <ComboboxPopup>
        <ComboboxEmpty>No time zone found.</ComboboxEmpty>
        <ComboboxList>
          {(zone: Zone) => (
            <ComboboxItem key={zone.value} value={zone}>
              {zone.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
