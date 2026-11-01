"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { saveVerifySettingsAction } from "./actions";

type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };

export function VerifySettingsForm(
  props: EnvTarget & {
    sandbox: boolean;
    projectName: string;
    /** The organization's numbers that can send now. */
    numbers: string[];
    settings: {
      appName: string | null;
      codeLength: number;
      ttlSeconds: number;
      maxAttempts: number;
      smsFrom: string | null;
      emailFrom: string | null;
      allowedCountries: string[];
    };
  },
) {
  const [state, formAction, pending] = useActionToast(saveVerifySettingsAction, {
    success: "Verify settings saved",
  });
  const { settings, sandbox, projectName, numbers, ...target } = props;
  // A number set before it stopped sending stays selectable, so saving doesn't drop it unseen.
  const choices =
    settings.smsFrom && !numbers.includes(settings.smsFrom)
      ? [settings.smsFrom, ...numbers]
      : numbers;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {Object.entries(target).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <Field>
        <FieldLabel>App name</FieldLabel>
        <Input
          defaultValue={settings.appName ?? ""}
          maxLength={40}
          name="appName"
          placeholder={projectName}
        />
        <FieldDescription>
          Named in every code: “Your {settings.appName ?? projectName} verification code is …”.
          Empty: the project's name.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>SMS codes come from</FieldLabel>
        <RadioGroup aria-label="SMS sender" defaultValue={settings.smsFrom ?? ""} name="smsFrom">
          <Label>
            <Radio value="" />
            coss.com's shared numbers (no registration needed)
          </Label>
          {choices.map((number) => (
            <Label key={number}>
              <Radio value={number} />
              <span className="font-mono">{number}</span>
            </Label>
          ))}
        </RadioGroup>
        <FieldDescription>
          {sandbox
            ? "Sandbox codes are simulated either way."
            : "Your own number must be registered and approved; its messages appear under SMS and are billed as SMS."}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Email codes come from</FieldLabel>
        <Input
          defaultValue={settings.emailFrom ?? ""}
          name="emailFrom"
          placeholder="codes@yourdomain.com"
          type="email"
        />
        <FieldDescription>
          An address on one of your verified domains. Empty: coss.com sends them as “
          {settings.appName ?? projectName} via coss.com”.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>Countries SMS codes may go to</FieldLabel>
        <Input
          className="font-mono"
          defaultValue={settings.allowedCountries.join(", ")}
          name="allowedCountries"
          placeholder="US, CA"
        />
        <FieldDescription>
          Two-letter country codes. Allow only where your users are: SMS pumping targets everywhere
          else.
        </FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <FieldLabel>Code length</FieldLabel>
          <Input
            defaultValue={settings.codeLength}
            max={10}
            min={4}
            name="codeLength"
            type="number"
          />
        </Field>
        <Field>
          <FieldLabel>Codes expire after (minutes)</FieldLabel>
          <Input
            defaultValue={Math.round(settings.ttlSeconds / 60)}
            max={30}
            min={1}
            name="ttlMinutes"
            type="number"
          />
        </Field>
        <Field>
          <FieldLabel>Wrong codes allowed</FieldLabel>
          <Input
            defaultValue={settings.maxAttempts}
            max={10}
            min={1}
            name="maxAttempts"
            type="number"
          />
        </Field>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Save settings
        </Button>
      </div>
    </form>
  );
}
