"use client";

import { Button } from "@coss/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { createLogDrainAction } from "./actions";
import { AuthFields, PresetSelect } from "./delivery-fields";
import { DRAIN_PRESETS } from "./presets";
import { SourceCheckboxes } from "./source-checkboxes";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

export function CreateDrainDialog(props: Target) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add log drain</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also discards the shown secret. */}
        <CreateDrainForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateDrainForm(props: Target) {
  const [state, formAction, pending] = useActionToast(createLogDrainAction, {
    success: "Log drain added",
  });
  const [presetId, setPresetId] = useState(DRAIN_PRESETS[0]?.id ?? "custom");
  const preset = DRAIN_PRESETS.find((candidate) => candidate.id === presetId) ?? DRAIN_PRESETS[0];

  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Log drain added</DialogTitle>
          <DialogDescription>
            Requests are signed with this secret: verify NDJSON batches with it (for example with{" "}
            <code>verifyLogDrainBatch</code> from the coss SDK). You can view it again on the
            drain's page.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
            {state.data.secret}
          </code>
          <div>
            <CopyButton label="Copy secret" value={state.data.secret} />
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            render={
              <Link
                href={`/${props.orgSlug}/${props.projectSlug}/${props.envSlug}/developers/log-drains/${state.data.id}`}
              />
            }
          >
            View log drain
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <DialogHeader>
        <DialogTitle>Add a log drain</DialogTitle>
        <DialogDescription>
          coss.com posts batches of log lines to this URL, usually within seconds: as signed NDJSON
          to your own endpoint, or straight into Grafana Cloud, Datadog or an OpenTelemetry
          collector.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <PresetSelect onValueChange={setPresetId} presets={DRAIN_PRESETS} value={presetId} />
        {preset ? (
          // Keyed by preset, so choosing another one starts its fields afresh.
          <div className="flex flex-col gap-4" key={preset.id}>
            <input name="format" type="hidden" value={preset.format} />
            <Field>
              <FieldLabel>URL</FieldLabel>
              <Input
                autoFocus
                defaultValue={preset.url}
                name="url"
                placeholder={preset.urlPlaceholder}
                required
                type="url"
              />
              <FieldDescription>{preset.urlHelp}</FieldDescription>
            </Field>
            <AuthFields
              basicLabels={preset.basicLabels}
              defaultHeaderName={preset.headerName}
              defaultKind={preset.auth}
              help={preset.credentialsHelp}
            />
          </div>
        ) : null}
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Input maxLength={256} name="description" placeholder="Optional" />
        </Field>
        <SourceCheckboxes />
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add log drain
        </Button>
      </DialogFooter>
    </form>
  );
}
