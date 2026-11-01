"use client";

import { Button } from "@coss/ui/components/button";
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
import { useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { connectMigrationAction } from "../actions";
import { PROVIDERS, type ProviderId } from "../labels";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

export function ConnectForm(props: Target) {
  const [state, formAction, pending] = useActionToast(connectMigrationAction, {
    success: "Connected",
  });
  // Controlled: a Postmark account token is sent again with the chosen server, and React resets
  // uncontrolled fields after an action.
  const [provider, setProvider] = useState<ProviderId>("resend");
  const [apiKey, setApiKey] = useState("");
  const servers = state?.ok && provider === "postmark" ? state.data.servers : [];
  const current = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <RadioGroup
        aria-label="Provider"
        name="provider"
        onValueChange={(value) => setProvider(value as ProviderId)}
        value={provider}
      >
        {PROVIDERS.map((entry) => (
          <Label className="items-start gap-3" key={entry.id}>
            <Radio className="mt-0.5" value={entry.id} />
            {entry.name}
          </Label>
        ))}
      </RadioGroup>
      <Field>
        <FieldLabel>{current.keyLabel}</FieldLabel>
        <Input
          autoComplete="off"
          className="font-mono"
          name="apiKey"
          onChange={(event) => setApiKey(event.target.value)}
          required
          spellCheck={false}
          type="password"
          value={apiKey}
        />
        <FieldDescription>
          {current.keyHint} It's kept encrypted until the import finishes (or is canceled), then
          deleted. Revoke it in {current.name} once you're done.
        </FieldDescription>
      </Field>
      {servers.length > 0 ? (
        <Field>
          <FieldLabel>Server</FieldLabel>
          <Select
            items={servers.map((server) => ({ value: String(server.id), label: server.name }))}
            name="serverId"
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a server" />
            </SelectTrigger>
            <SelectPopup>
              {servers.map((server) => (
                <SelectItem key={server.id} value={String(server.id)}>
                  {server.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>
            This token reads several servers: choose the one to import into this environment.
          </FieldDescription>
        </Field>
      ) : null}
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          {servers.length > 0 ? "Continue" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
