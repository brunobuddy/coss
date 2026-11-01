"use client";

import type { ContentStorageMode } from "@coss/email/schemas";
import { Button } from "@coss/ui/components/button";
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import { useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { saveStorageSettingsAction } from "./actions";

const OPTIONS: { value: ContentStorageMode; label: string; description: string }[] = [
  {
    value: "store",
    label: "Store content",
    description:
      "Keep each email's subject, body, headers and attachment names for the email retention period, to read back here and through the API.",
  },
  {
    value: "discard",
    label: "Discard content once sent",
    description:
      "Keep them only until the email is sent, fails or is canceled. Addresses, tags, statuses and events are kept as usual.",
  },
];

/** The environment's content storage; read-only (disabled) without `environment:update`. */
export function StorageSettingsForm(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  contentStorage: ContentStorageMode;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionToast(saveStorageSettingsAction, {
    success: {
      title: "Content storage saved",
      description: "New emails use it; emails already sent keep theirs.",
    },
  });
  const [mode, setMode] = useState<ContentStorageMode>(props.contentStorage);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <RadioGroup
        aria-label="Content storage"
        disabled={!props.canEdit}
        name="contentStorage"
        onValueChange={(value) => setMode(value as ContentStorageMode)}
        value={mode}
      >
        {OPTIONS.map((option) => (
          <Label className="items-start gap-3" key={option.value}>
            <Radio className="mt-0.5" value={option.value} />
            <span className="flex flex-col gap-0.5">
              {option.label}
              <span className="font-normal text-muted-foreground text-xs">
                {option.description}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canEdit ? (
        <div>
          <Button
            disabled={mode === props.contentStorage}
            loading={pending}
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </div>
      ) : null}
    </form>
  );
}
