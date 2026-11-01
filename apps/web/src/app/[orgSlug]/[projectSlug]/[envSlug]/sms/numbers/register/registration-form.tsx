"use client";

import { SMS_MONTHLY_VOLUMES, SMS_USE_CASE_LABELS, SMS_USE_CASES } from "@coss/sms/schemas";
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
import { Textarea } from "@coss/ui/components/textarea";
import { useState } from "react";
import { countryName, isCountryCode } from "@/components/fields/countries";
import { Segmented } from "@/components/fields/segmented";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/panel";
import { useActionToast } from "@/lib/toast";
import { createRegistrationAction } from "../actions";

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The form's fields as the registration the server validates (`SmsRegistrationInput`). */
function registrationOf(form: FormData) {
  const profile = {
    legalName: text(form, "legalName"),
    companyType: text(form, "companyType"),
    taxId: text(form, "taxId"),
    taxIdType: text(form, "taxIdType") || "EIN",
    industry: text(form, "industry"),
    website: text(form, "website"),
    street: text(form, "street"),
    city: text(form, "city"),
    region: text(form, "region"),
    postalCode: text(form, "postalCode"),
    country: text(form, "country").toUpperCase(),
    stockExchange: text(form, "stockExchange") || null,
    stockTicker: text(form, "stockTicker") || null,
    contact: {
      firstName: text(form, "firstName"),
      lastName: text(form, "lastName"),
      email: text(form, "email"),
      phone: text(form, "phone").replace(/[\s()-]/g, ""),
      title: text(form, "title"),
      jobPosition: text(form, "jobPosition"),
    },
  };
  const campaign = {
    useCase: text(form, "useCase"),
    description: text(form, "description"),
    messageFlow: text(form, "messageFlow"),
    samples: [text(form, "sample1"), text(form, "sample2"), text(form, "sample3")].filter(Boolean),
    hasEmbeddedLinks: form.get("hasEmbeddedLinks") === "on",
    hasEmbeddedPhone: form.get("hasEmbeddedPhone") === "on",
    optInProofUrl: text(form, "optInProofUrl") || null,
    monthlyVolume: text(form, "monthlyVolume") || null,
    privacyPolicyUrl: text(form, "privacyPolicyUrl") || null,
    termsUrl: text(form, "termsUrl") || null,
  };
  return text(form, "kind") === "toll_free"
    ? { kind: "toll_free", numberId: text(form, "numberId"), profile, campaign }
    : { kind: "us_10dlc", brandType: text(form, "brandType"), profile, campaign };
}

/** A rejected registration's answers by field name, to fix and submit again. */
export type RegistrationDefaults = Readonly<Record<string, string | boolean>>;

function TextField(props: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  description?: string;
  required?: boolean;
  defaults?: RegistrationDefaults;
}) {
  const value = props.defaults?.[props.name];
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Input
        defaultValue={typeof value === "string" ? value : undefined}
        name={props.name}
        placeholder={props.placeholder}
        required={props.required ?? true}
        type={props.type ?? "text"}
      />
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

type Item = { value: string; label: string; disabled?: boolean };

function SelectField(props: {
  name: string;
  label: string;
  items: Item[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select
        defaultValue={props.defaultValue}
        items={props.items}
        name={props.name}
        onValueChange={(value) => props.onValueChange?.(String(value))}
        value={props.value}
      >
        <SelectTrigger aria-label={props.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {props.items.map((item) => (
            <SelectItem disabled={item.disabled} key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

/** A code typed in capitals ("CA", "US"), with the country it names beside it when `country`. */
function CodeField(props: {
  name: string;
  label: string;
  placeholder: string;
  defaults: RegistrationDefaults;
  country?: boolean;
}) {
  const initial = props.defaults[props.name];
  const [value, setValue] = useState(typeof initial === "string" ? initial.toUpperCase() : "");
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <div className="flex w-full items-center gap-2">
        <Input
          className={props.country ? "w-20 font-mono" : undefined}
          maxLength={props.country ? 2 : undefined}
          name={props.name}
          onChange={(event) => setValue(event.currentTarget.value.toUpperCase())}
          placeholder={props.placeholder}
          required
          value={value}
        />
        {props.country && isCountryCode(value) ? (
          <span className="text-muted-foreground text-sm">{countryName(value)}</span>
        ) : null}
      </div>
    </Field>
  );
}

export function RegistrationForm(props: {
  orgSlug: string;
  tollFreeNumbers: { id: string; phoneNumber: string }[];
  canRegister10dlc: boolean;
  initialKind: "us_10dlc" | "toll_free";
  initialNumberId: string | null;
  defaults?: RegistrationDefaults;
}) {
  const defaults = props.defaults ?? {};
  const pick = (name: string, fallback: string): string => {
    const value = defaults[name];
    return typeof value === "string" && value ? value : fallback;
  };
  const [kind, setKind] = useState<string>(props.initialKind);
  const [brandType, setBrandType] = useState(pick("brandType", "low_volume_standard"));
  const [companyType, setCompanyType] = useState(pick("companyType", "PRIVATE_PROFIT"));
  // Carriers take only the low-volume mixed use case from a low-volume standard brand.
  const useCases =
    kind === "us_10dlc" && brandType === "low_volume_standard"
      ? SMS_USE_CASES.filter((useCase) => useCase === "LOW_VOLUME")
      : SMS_USE_CASES;
  const [state, formAction, pending] = useActionToast(createRegistrationAction, {
    success: "Registration submitted",
  });

  return (
    <form
      action={(form) => {
        form.set("registration", JSON.stringify(registrationOf(form)));
        formAction(form);
      }}
      className="flex flex-col gap-6"
    >
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <Panel>
        <PanelHeader>
          <PanelTitle>What to register</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <SelectField
            items={[
              {
                value: "us_10dlc",
                label: "US A2P 10DLC (local numbers)",
                disabled: !props.canRegister10dlc,
              },
              {
                value: "toll_free",
                label: "Toll-free verification",
                disabled: props.tollFreeNumbers.length === 0,
              },
            ]}
            label="Sender"
            name="kind"
            onValueChange={setKind}
            value={kind}
          />
          {kind === "us_10dlc" ? (
            <SelectField
              description="Standard brands pay a one-time vetting fee for more throughput."
              items={[
                {
                  value: "low_volume_standard",
                  label: "Low-volume standard (under 6,000 segments a day)",
                },
                { value: "standard", label: "Standard (secondary vetting, higher throughput)" },
              ]}
              label="Brand"
              name="brandType"
              onValueChange={setBrandType}
              value={brandType}
            />
          ) : (
            <SelectField
              defaultValue={props.initialNumberId ?? props.tollFreeNumbers[0]?.id}
              items={props.tollFreeNumbers.map((number) => ({
                value: number.id,
                label: number.phoneNumber,
              }))}
              label="Toll-free number"
              name="numberId"
            />
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Business</PanelTitle>
          <PanelDescription>
            Exactly as registered with your tax authority: carriers check it.
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <TextField
            defaults={defaults}
            label="Legal name"
            name="legalName"
            placeholder="Acme, Inc."
          />
          <Field>
            <FieldLabel>Company type</FieldLabel>
            <Segmented
              aria-label="Company type"
              name="companyType"
              onValueChange={setCompanyType}
              options={[
                { value: "PRIVATE_PROFIT", label: "Private" },
                { value: "PUBLIC_PROFIT", label: "Public" },
                { value: "NON_PROFIT", label: "Non-profit" },
              ]}
              value={companyType}
            />
          </Field>
          <TextField
            defaults={defaults}
            description="US: your EIN (12-3456789)."
            label="Tax ID"
            name="taxId"
          />
          <SelectField
            defaultValue={pick("taxIdType", "EIN")}
            items={[
              { value: "EIN", label: "EIN (US)" },
              { value: "CBN", label: "Business number (Canada)" },
              { value: "VAT", label: "VAT" },
              { value: "DUNS", label: "DUNS" },
            ]}
            label="Tax ID type"
            name="taxIdType"
          />
          <TextField
            defaults={defaults}
            label="Industry"
            name="industry"
            placeholder="TECHNOLOGY"
          />
          <TextField
            defaults={defaults}
            label="Website"
            name="website"
            placeholder="https://acme.com"
            type="url"
          />
          <TextField defaults={defaults} label="Street" name="street" />
          <TextField defaults={defaults} label="City" name="city" />
          <CodeField defaults={defaults} label="State or region" name="region" placeholder="CA" />
          <TextField defaults={defaults} label="Postal code" name="postalCode" />
          <CodeField country defaults={defaults} label="Country" name="country" placeholder="US" />
          {companyType === "PUBLIC_PROFIT" ? (
            <>
              <TextField
                defaults={defaults}
                label="Stock exchange"
                name="stockExchange"
                placeholder="NASDAQ"
              />
              <TextField
                defaults={defaults}
                label="Stock ticker"
                name="stockTicker"
                placeholder="ACME"
              />
            </>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Authorized representative</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          <TextField defaults={defaults} label="First name" name="firstName" />
          <TextField defaults={defaults} label="Last name" name="lastName" />
          <TextField defaults={defaults} label="Email" name="email" type="email" />
          <TextField
            defaults={defaults}
            label="Phone"
            name="phone"
            placeholder="+14155550123"
            type="tel"
          />
          <TextField defaults={defaults} label="Title" name="title" placeholder="CTO" />
          <SelectField
            defaultValue={pick("jobPosition", "Director")}
            items={["Director", "GM", "VP", "CEO", "CFO", "General Counsel", "Other"].map(
              (position) => ({ value: position, label: position }),
            )}
            label="Position"
            name="jobPosition"
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Messages</PanelTitle>
          <PanelDescription>
            What you'll send and how people agree to it. Carriers reject vague descriptions:
            describe your actual messages.
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="flex flex-col gap-4">
          <SelectField
            defaultValue={pick("useCase", useCases[0] ?? "LOW_VOLUME")}
            items={useCases.map((useCase) => ({
              value: useCase,
              label: SMS_USE_CASE_LABELS[useCase],
            }))}
            key={useCases.length}
            label="Use case"
            name="useCase"
          />
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea
              defaultValue={pick("description", "")}
              name="description"
              placeholder="Acme sends sign-in codes and account alerts to its customers."
              required
            />
          </Field>
          <Field>
            <FieldLabel>How people opt in</FieldLabel>
            <Textarea
              defaultValue={pick("messageFlow", "")}
              name="messageFlow"
              placeholder="Customers enter their number on acme.com/settings and tick a box agreeing to texts; message and data rates may apply; reply STOP to opt out."
              required
            />
          </Field>
          <TextField
            defaults={defaults}
            label="Sample message"
            name="sample1"
            placeholder="Acme: your code is 123456. Reply STOP to opt out."
          />
          <TextField defaults={defaults} label="Another sample" name="sample2" />
          <TextField
            defaults={defaults}
            label="Another sample (optional)"
            name="sample3"
            required={false}
          />
          {kind === "toll_free" ? (
            <>
              <TextField
                defaults={defaults}
                description="A public screenshot or page of where people give their number and consent."
                label="Opt-in proof URL"
                name="optInProofUrl"
                type="url"
              />
              <SelectField
                defaultValue={pick("monthlyVolume", "1,000")}
                items={SMS_MONTHLY_VOLUMES.map((volume) => ({ value: volume, label: volume }))}
                label="Messages a month"
                name="monthlyVolume"
              />
              <TextField
                defaults={defaults}
                description="Public, and it should say you never share phone numbers or opt-in consent with third parties for marketing."
                label="Privacy policy URL"
                name="privacyPolicyUrl"
                placeholder="https://acme.com/privacy"
                type="url"
              />
              <TextField
                defaults={defaults}
                label="Terms URL"
                name="termsUrl"
                placeholder="https://acme.com/terms"
                required={false}
                type="url"
              />
            </>
          ) : null}
          <Label className="gap-2">
            <Checkbox defaultChecked={defaults.hasEmbeddedLinks === true} name="hasEmbeddedLinks" />
            Messages contain links
          </Label>
          <Label className="gap-2">
            <Checkbox defaultChecked={defaults.hasEmbeddedPhone === true} name="hasEmbeddedPhone" />
            Messages contain phone numbers
          </Label>
        </PanelBody>
      </Panel>

      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Submit registration
        </Button>
      </div>
    </form>
  );
}
