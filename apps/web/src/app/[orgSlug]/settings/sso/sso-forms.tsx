"use client";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Textarea } from "@coss/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@coss/ui/components/toggle-group";
import { KeyRoundIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { SettingsFooter, SettingsRow } from "@/components/settings";
import { SettingsSwitchRow } from "@/components/settings-switch-row";
import { useActionToast } from "@/lib/toast";
import { deleteSsoProviderAction, saveSsoProviderAction, setSsoRequirementAction } from "./actions";

type ProviderType = "oidc" | "saml";

/** Inputs on the right of a row: wide enough for URLs, never the whole card. */
const CONTROL = "sm:w-80";

export type SsoProviderFormValues = {
  type: ProviderType;
  domains: string[];
  oidc: { issuer: string; clientId: string } | null;
  saml: { entryPoint: string; idpEntityId: string | null; usesMetadata: boolean } | null;
};

/**
 * Creates or updates the organization's provider: the rows of the Identity provider section,
 * saved from its footer. Secrets are never sent back to the form.
 */
export function SsoProviderForm(props: {
  orgSlug: string;
  /** Verified email domains of the organization, plus any domain the provider already lists. */
  domainOptions: string[];
  current: SsoProviderFormValues | null;
}) {
  const editing = props.current !== null;
  const [state, formAction, pending] = useActionToast(saveSsoProviderAction, {
    success: editing ? "SSO provider saved" : "SSO provider added",
  });
  const [type, setType] = useState<ProviderType>(props.current?.type ?? "oidc");
  const selected = new Set(props.current?.domains ?? []);

  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="type" type="hidden" value={type} />
      {editing ? null : (
        <SettingsRow description="Whichever your provider supports best." label="Protocol">
          <ToggleGroup
            aria-label="Protocol"
            onValueChange={(value) => {
              const next = value[0];
              if (next === "oidc" || next === "saml") setType(next);
            }}
            value={[type]}
            variant="outline"
          >
            <ToggleGroupItem value="oidc">OpenID Connect</ToggleGroupItem>
            <ToggleGroupItem value="saml">SAML 2.0</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
      )}

      {type === "oidc" ? (
        <>
          <SettingsRow
            description="We read its /.well-known/openid-configuration. Must be public and https://."
            label={<label htmlFor="sso-oidc-issuer">Issuer URL</label>}
          >
            <Input
              className={CONTROL}
              defaultValue={props.current?.oidc?.issuer ?? ""}
              id="sso-oidc-issuer"
              name="oidcIssuer"
              placeholder="https://acme.okta.com"
              required
              type="url"
            />
          </SettingsRow>
          <SettingsRow label={<label htmlFor="sso-oidc-client-id">Client ID</label>}>
            <Input
              autoComplete="off"
              className={CONTROL}
              defaultValue={props.current?.oidc?.clientId ?? ""}
              id="sso-oidc-client-id"
              name="oidcClientId"
              required
            />
          </SettingsRow>
          <SettingsRow
            description={editing ? "Leave it empty to keep the current secret." : undefined}
            label={<label htmlFor="sso-oidc-client-secret">Client secret</label>}
          >
            <Input
              autoComplete="off"
              className={CONTROL}
              id="sso-oidc-client-secret"
              name="oidcClientSecret"
              placeholder={editing ? "••••••••" : undefined}
              required={!editing}
              type="password"
            />
          </SettingsRow>
        </>
      ) : (
        <>
          <SettingsRow
            description={
              props.current?.saml?.usesMetadata
                ? "Preferred. Leave it empty to keep the current metadata, or fill in the three fields below instead."
                : "Preferred. Or leave it empty and fill in the three fields below instead."
            }
            label={<label htmlFor="sso-saml-metadata">IdP metadata XML</label>}
            stacked
          >
            <Textarea
              className="font-mono text-xs"
              id="sso-saml-metadata"
              name="samlMetadata"
              placeholder={
                props.current?.saml?.usesMetadata
                  ? "Leave empty to keep the current metadata"
                  : '<md:EntityDescriptor entityID="…">'
              }
              rows={6}
              spellCheck={false}
            />
          </SettingsRow>
          <SettingsRow label={<label htmlFor="sso-saml-entry-point">SSO URL</label>}>
            <Input
              className={CONTROL}
              defaultValue={
                props.current?.saml?.usesMetadata ? "" : props.current?.saml?.entryPoint
              }
              id="sso-saml-entry-point"
              name="samlEntryPoint"
              placeholder="https://acme.okta.com/app/…/sso/saml"
              type="url"
            />
          </SettingsRow>
          <SettingsRow
            label={<label htmlFor="sso-saml-idp-entity-id">IdP entity ID (issuer)</label>}
          >
            <Input
              className={CONTROL}
              defaultValue={props.current?.saml?.idpEntityId ?? ""}
              id="sso-saml-idp-entity-id"
              name="samlIdpEntityId"
              placeholder="http://www.okta.com/exk…"
            />
          </SettingsRow>
          <SettingsRow
            label={<label htmlFor="sso-saml-certificate">Signing certificate</label>}
            stacked
          >
            <Textarea
              className="font-mono text-xs"
              id="sso-saml-certificate"
              name="samlCertificate"
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={4}
              spellCheck={false}
            />
          </SettingsRow>
        </>
      )}

      <SettingsRow
        description="People with an address at these domains sign in through this provider."
        label="Domains"
        stacked
      >
        {props.domainOptions.length === 0 ? (
          <p className="text-muted-foreground">
            No verified domains yet. Add and verify one under Domains first.
          </p>
        ) : (
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="sr-only">Domains</legend>
            {props.domainOptions.map((domain) => (
              <Label className="font-mono font-normal text-[0.8125rem]" key={domain}>
                <Checkbox defaultChecked={selected.has(domain)} name="domains" value={domain} />
                {domain}
              </Label>
            ))}
          </fieldset>
        )}
      </SettingsRow>

      <SettingsFooter
        hint={
          state && !state.ok ? (
            <span className="text-destructive-foreground">{state.error}</span>
          ) : null
        }
      >
        <Button
          disabled={props.domainOptions.length === 0}
          loading={pending}
          size="sm"
          type="submit"
        >
          {editing ? "Save changes" : "Save provider"}
        </Button>
      </SettingsFooter>
    </form>
  );
}

export function DeleteSsoProviderButton(props: { orgSlug: string }) {
  // On success the page re-renders without a provider, which unmounts this dialog.
  const [state, formAction, pending] = useActionToast(deleteSsoProviderAction, {
    success: "SSO provider removed",
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Remove provider
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <AlertDialogHeader>
            <DialogIcon icon={KeyRoundIcon} tone="danger" />
            <AlertDialogTitle>Remove the SSO provider?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody will be able to sign in with SSO, the SSO requirement is turned off, every
              account's link to this provider is deleted and everyone signed in with it (you too, if
              you did) is signed out. Members without a password can set one with “Forgot password”.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Remove provider
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** The organization's SSO requirement as a settings row; the switch saves on change. */
export function SsoRequirementRow(props: {
  orgSlug: string;
  required: boolean;
  /** Every precondition for turning it on holds (the action re-checks them). */
  canRequire: boolean;
  description: ReactNode;
}) {
  return (
    <SettingsSwitchRow
      action={setSsoRequirementAction}
      canTurnOn={props.canRequire}
      description={props.description}
      id="require-sso"
      label="Require SSO for members and admins"
      orgSlug={props.orgSlug}
      required={props.required}
      turnedOff="SSO no longer required"
      turnedOn="SSO now required"
    />
  );
}
