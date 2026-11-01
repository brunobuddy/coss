"use client";

import {
  CONTENT_CATEGORIES,
  type RiskReasonCode,
  type RiskSettingsOutput,
} from "@coss/risk/schemas";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
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
import { updateRiskSettingsAction } from "../actions";

const PROVIDERS = [
  { value: "none", label: "Off" },
  { value: "turnstile", label: "Cloudflare Turnstile" },
  { value: "hcaptcha", label: "hCaptcha" },
];

export function RiskSettingsForm(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  settings: RiskSettingsOutput;
  /** Reasons that can be turned off, with what they mean. */
  reasons: { code: RiskReasonCode; description: string }[];
  canUpdate: boolean;
}) {
  const [state, formAction, pending] = useActionToast(updateRiskSettingsAction, {
    success: "Risk settings saved",
  });
  const [provider, setProvider] = useState(props.settings.captcha?.provider ?? "none");
  // Controlled: the page re-renders with the saved settings, which must not reset what's checked.
  const [disabled, setDisabled] = useState(() => new Set<string>(props.settings.disabled_reasons));
  const [required, setRequired] = useState(props.settings.captcha?.required ?? false);
  const providerChanged = provider !== (props.settings.captcha?.provider ?? "none");

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <fieldset className="flex flex-col gap-4" disabled={!props.canUpdate}>
        <legend className="mb-2 font-semibold">Thresholds</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Review at</FieldLabel>
            <Input
              defaultValue={props.settings.review_threshold}
              max={1}
              min={0.01}
              name="reviewThreshold"
              required
              step={0.01}
              type="number"
            />
            <FieldDescription>Scores at or above this are review.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Block at</FieldLabel>
            <Input
              defaultValue={props.settings.block_threshold}
              max={1}
              min={0.01}
              name="blockThreshold"
              required
              step={0.01}
              type="number"
            />
            <FieldDescription>Scores at or above this are block.</FieldDescription>
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={!props.canUpdate}>
        <legend className="mb-2 font-semibold">Captcha</legend>
        <Field>
          <FieldLabel>Provider</FieldLabel>
          <Select
            items={PROVIDERS}
            name="captchaProvider"
            onValueChange={(value) => setProvider(String(value))}
            value={provider}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {PROVIDERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>
            Assessments verify their captcha token with it. coss.com sends the provider the token,
            your secret and the user's IP address.
          </FieldDescription>
        </Field>
        {provider === "none" ? null : (
          <>
            <Field>
              <FieldLabel>Secret key</FieldLabel>
              <Input
                autoComplete="off"
                name="captchaSecret"
                placeholder={
                  providerChanged ? "Required" : "Leave empty to keep the current secret"
                }
                required={providerChanged}
                type="password"
              />
              <FieldDescription>Stored encrypted; never shown again.</FieldDescription>
            </Field>
            <Label className="gap-3">
              <Checkbox
                checked={required}
                name="captchaRequired"
                onCheckedChange={(checked) => setRequired(checked === true)}
              />
              Require a token (assessments without one get captcha.missing)
            </Label>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4" disabled={!props.canUpdate}>
        <legend className="mb-2 font-semibold">Content thresholds</legend>
        <p className="text-muted-foreground text-sm">
          Assessments with content fire content.&lt;category&gt; when its score reaches the
          threshold. Leave a category empty and it never fires; rules can still test its score.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          {CONTENT_CATEGORIES.map((category) => (
            <Field key={category}>
              <FieldLabel className="capitalize">{category}</FieldLabel>
              <Input
                defaultValue={props.settings.content_thresholds[category] ?? ""}
                max={1}
                min={0.01}
                name={`contentThreshold.${category}`}
                placeholder="Off"
                step={0.01}
                type="number"
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={!props.canUpdate}>
        <legend className="mb-1 font-semibold">Disabled reasons</legend>
        <p className="text-muted-foreground text-sm">
          Checked reasons never fire and don't count in the score. Rules still see the facts behind
          them.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {props.reasons.map((reason) => (
            <Label className="items-start gap-3" key={reason.code}>
              <Checkbox
                checked={disabled.has(reason.code)}
                className="mt-0.5"
                name="disabledReasons"
                onCheckedChange={(checked) =>
                  setDisabled((current) => {
                    const next = new Set(current);
                    if (checked) next.add(reason.code);
                    else next.delete(reason.code);
                    return next;
                  })
                }
                value={reason.code}
              />
              <span className="flex flex-col gap-0.5">
                <code className="text-xs">{reason.code}</code>
                <span className="font-normal text-muted-foreground text-xs">
                  {reason.description}
                </span>
              </span>
            </Label>
          ))}
        </div>
      </fieldset>

      {state && !state.ok ? <FormError message={state.error} /> : null}
      {props.canUpdate ? (
        <div>
          <Button loading={pending} type="submit">
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}
