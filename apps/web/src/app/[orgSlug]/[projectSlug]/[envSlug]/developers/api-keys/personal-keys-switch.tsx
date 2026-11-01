"use client";

import { Switch } from "@coss/ui/components/switch";
import { useRef } from "react";
import { Panel, PanelBody } from "@/components/panel";
import { useActionToast } from "@/lib/toast";
import { setPersonalKeysAction } from "./actions";

/**
 * Whether members may create personal API keys in this environment; the switch saves on change.
 * Owners and admins always may (and can assign keys to members).
 */
export function PersonalKeysSwitch(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  enabled: boolean;
  live: boolean;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionToast(setPersonalKeysAction, {
    success: props.enabled ? "Personal keys turned off" : "Personal keys turned on",
  });
  const form = useRef<HTMLFormElement>(null);
  // While saving, show where the switch is going; the refreshed page then confirms it.
  const checked = pending ? !props.enabled : props.enabled;

  return (
    <Panel>
      <PanelBody>
        <form action={formAction} className="flex items-center justify-between gap-6" ref={form}>
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="projectSlug" type="hidden" value={props.projectSlug} />
          <input name="envSlug" type="hidden" value={props.envSlug} />
          <input name="required" type="hidden" value={String(!props.enabled)} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <label className="font-medium text-sm" htmlFor="personal-keys">
              Personal keys for members
            </label>
            <p className="max-w-2xl text-pretty text-muted-foreground text-sm">
              Members can create their own keys here, which can do everything a key can in this
              environment.{" "}
              {props.live
                ? "What they send counts as their spend, within their budget."
                : "Sandbox usage is never billed."}{" "}
              Turning this off keeps existing keys working.
            </p>
            {state && !state.ok ? (
              <p className="text-destructive-foreground text-sm">{state.error}</p>
            ) : null}
          </div>
          <Switch
            checked={checked}
            disabled={props.disabled || pending}
            id="personal-keys"
            onCheckedChange={() => form.current?.requestSubmit()}
          />
        </form>
      </PanelBody>
    </Panel>
  );
}
