"use client";

import {
  API_KEY_PERMISSION_GROUPS,
  API_KEY_PRESET_LABELS,
  API_KEY_PRESETS,
  API_KEY_RESOURCES,
  type ApiKeyPreset,
  apiKeyActionLabel,
} from "@coss/auth/api-key-permissions";
import { API_KEY_NAME_MAX_LENGTH, API_KEY_PERMISSIONS } from "@coss/auth/constants";
import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
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
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { createApiKeyAction } from "./actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

/** `me`, `organization` or a member's user id (see `createApiKeyAction`). */
export type OwnerOption = { value: string; label: string };

type FormProps = Target & {
  environmentName: string;
  /** Owners and admins choose who the key belongs to; `null`: a personal key of the creator. */
  owners: OwnerOption[] | null;
};

const PRESET_DESCRIPTIONS: Record<ApiKeyPreset, string> = {
  full: "Every API, including products added later.",
  sending: "Only sends email, through the API, SDK or SMTP. For application servers.",
  read_only: "Reads everything this key's environment and organization hold; changes nothing.",
  custom: "Choose the permissions yourself. The key never gains new ones.",
};

export function CreateApiKeyDialog(props: FormProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon />
        Create API key
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also discards the shown key and form state. */}
        <CreateApiKeyForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateApiKeyForm(props: FormProps) {
  const [state, formAction, pending] = useActionToast(createApiKeyAction, {
    success: (data) => `API key “${data.name}” created`,
  });
  const [preset, setPreset] = useState<ApiKeyPreset>("full");

  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Save your API key</DialogTitle>
          <DialogDescription>
            Copy “{state.data.name}” now. For security it won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <code className="block select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
            {state.data.key}
          </code>
          <div>
            <CopyButton label="Copy key" value={state.data.key} />
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
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
        <DialogTitle>Create API key</DialogTitle>
        <DialogDescription>
          The key only works in the {props.environmentName} environment.
          {props.owners ? null : " It is your personal key: what it sends counts as your spend."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            autoFocus
            maxLength={API_KEY_NAME_MAX_LENGTH}
            name="name"
            placeholder="e.g. Backend server"
            required
          />
          <FieldDescription>Up to {API_KEY_NAME_MAX_LENGTH} characters.</FieldDescription>
        </Field>
        {props.owners ? <OwnerField owners={props.owners} /> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium text-sm">Access</legend>
          <RadioGroup
            aria-label="Access"
            name="access"
            onValueChange={(value) => setPreset(value as ApiKeyPreset)}
            value={preset}
          >
            {API_KEY_PRESETS.map((option) => (
              <Label className="items-start gap-3" key={option}>
                <Radio className="mt-0.5" value={option} />
                <span className="flex flex-col gap-0.5">
                  {API_KEY_PRESET_LABELS[option]}
                  <span className="font-normal text-muted-foreground text-xs">
                    {PRESET_DESCRIPTIONS[option]}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        {preset === "custom" ? <CustomPermissions /> : null}
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Who the key belongs to: an organization key or a member's personal key (their spend). */
function OwnerField(props: { owners: OwnerOption[] }) {
  return (
    <Field>
      <FieldLabel>Owner</FieldLabel>
      <Select defaultValue="organization" items={props.owners} name="owner">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {props.owners.map((owner) => (
            <SelectItem key={owner.value} value={owner.value}>
              {owner.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <FieldDescription>
        Organization keys are for production and shared servers. A personal key's usage counts as
        its owner's spend, and it stops working when they leave the organization.
      </FieldDescription>
    </Field>
  );
}

/** One row per resource, its actions as checkboxes (`permission=resource:action`). */
function CustomPermissions() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      {API_KEY_PERMISSION_GROUPS.map((group) => (
        <fieldset className="flex flex-col gap-3" key={group}>
          <legend className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {group}
          </legend>
          {API_KEY_RESOURCES.filter((info) => info.group === group).map((info) => (
            <div className="flex flex-col gap-1.5" key={info.resource}>
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">{info.label}</span>
                <span className="text-muted-foreground text-xs">{info.description}</span>
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1.5">
                {(API_KEY_PERMISSIONS[info.resource] ?? []).map((action) => (
                  <Label className="font-normal text-sm" key={action}>
                    <Checkbox
                      aria-label={`${info.label}: ${apiKeyActionLabel(action)}`}
                      name="permission"
                      value={`${info.resource}:${action}`}
                    />
                    {apiKeyActionLabel(action)}
                  </Label>
                ))}
              </span>
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Shown instead of the dialog when the session may not create keys here. */
export function CreateApiKeyUnavailable({ reason }: { reason: string }) {
  return (
    <Alert variant="warning">
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
}
