"use client";

import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Label } from "@coss/ui/components/label";
import { useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { startMigrationAction } from "../actions";
import { KIND_LABELS, type KindId } from "../labels";

export type KindChoice = {
  kind: KindId;
  /** What was found ("12 templates"). */
  found: string;
  /** Why it can't be chosen (not offered, not allowed, nothing found). */
  unavailable: string | null;
};

export function StartImportForm(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  migrationId: string;
  kinds: KindChoice[];
  domains: { id: string; name: string; verified: boolean }[];
}) {
  const [state, formAction, pending] = useActionToast(startMigrationAction, {
    success: "Import started",
  });
  const [domainsChosen, setDomainsChosen] = useState(
    props.kinds.some((choice) => choice.kind === "domains" && !choice.unavailable),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="migrationId" type="hidden" value={props.migrationId} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-medium text-sm">What to import</legend>
        {props.kinds.map((choice) => (
          <div className="flex flex-col gap-3" key={choice.kind}>
            <Label className="items-start gap-3">
              <Checkbox
                className="mt-0.5"
                defaultChecked={!choice.unavailable}
                disabled={Boolean(choice.unavailable)}
                name="kinds"
                onCheckedChange={
                  choice.kind === "domains" ? (checked) => setDomainsChosen(checked) : undefined
                }
                value={choice.kind}
              />
              <span className="flex flex-col gap-0.5">
                <span>
                  {KIND_LABELS[choice.kind].label}
                  <span className="ms-2 font-normal text-muted-foreground">{choice.found}</span>
                </span>
                <span className="font-normal text-muted-foreground text-xs">
                  {choice.unavailable ?? KIND_LABELS[choice.kind].description}
                </span>
              </span>
            </Label>
            {choice.kind === "domains" && domainsChosen && !choice.unavailable ? (
              <div className="ms-7 flex flex-col gap-2">
                {props.domains.map((domain) => (
                  <Label className="gap-3 font-normal" key={domain.id}>
                    <Checkbox defaultChecked name="domainIds" value={domain.id} />
                    <span className="font-mono text-[0.8125rem]">{domain.name}</span>
                    {domain.verified ? null : (
                      <span className="text-muted-foreground text-xs">
                        (not verified there either)
                      </span>
                    )}
                  </Label>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </fieldset>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Start import
        </Button>
      </div>
    </form>
  );
}
