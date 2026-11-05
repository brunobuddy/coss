"use client";

import {
  API_KEY_PRESET_LABELS,
  type ApiKeyAccess,
  type KeyPermissions,
  permissionLines,
  summarizeKeyAccess,
} from "@coss/auth/api-key-permissions";
import { Badge } from "@coss/ui/components/badge";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@coss/ui/components/popover";

/** A key's access; restricted keys open the list of what they hold. */
export function ApiKeyAccessBadge(props: { access: ApiKeyAccess; permissions: KeyPermissions }) {
  const summary = summarizeKeyAccess(props.access, props.permissions);
  const label = API_KEY_PRESET_LABELS[summary];
  if (props.access === "full") return <Badge variant="outline">{label}</Badge>;

  const lines = permissionLines(props.permissions);
  return (
    <Popover>
      <PopoverTrigger render={<Badge render={<button type="button" />} variant="outline" />}>
        {label}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-72">
        <PopoverTitle className="mb-2 text-sm">Permissions</PopoverTitle>
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">This key can't do anything.</p>
        ) : (
          <dl className="flex flex-col gap-1.5 text-sm">
            {lines.map((line) => (
              <div className="flex justify-between gap-4" key={line.resource}>
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="text-right">{line.actions.join(", ")}</dd>
              </div>
            ))}
          </dl>
        )}
      </PopoverPopup>
    </Popover>
  );
}
