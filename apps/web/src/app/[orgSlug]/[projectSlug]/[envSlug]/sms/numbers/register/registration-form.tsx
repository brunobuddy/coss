"use client";

import { SMS_MONTHLY_VOLUMES, SMS_USE_CASE_LABELS, SMS_USE_CASES } from "@coss/sms/schemas";
import { Button } from "@coss/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Textarea } from "@coss/ui/components/textarea";
import { useState } from "react";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/panel";
import { useActionToast } from "@/lib/toast";
import { createRegistrationAction } from "../actions";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs/5 outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
          <Field>
            <FieldLabel>Sender</FieldLabel>
            <select
              aria-label="Sender"
              className={SELECT_CLASS}
              name="kind"
              onChange={(event) => setKind(event.target.value)}
              value={kind}
            >
              <option disabled={!props.canRegister10dlc} value="us_10dlc">
                US A2P 10DLC (local numbers)
              </option>
              <option disabled={props.tollFreeNumbers.length === 0} value="toll_free">
                Toll-free verification
              </option>
            </select>
          </Field>
          {kind === "us_10dlc" ? (
            <Field>
              <FieldLabel>Brand</FieldLabel>
              <select
                aria-label="Brand"
                className={SELECT_CLASS}
                name="brandType"
                onChange={(event) => setBrandType(event.target.value)}
                value={brandType}
              >
                <option value="low_volume_standard">
                  Low-volume standard (under 6,000 segments a day)
                </option>
                <option value="standard">Standard (secondary vetting, higher throughput)</option>
              </select>
              <FieldDescription>
                Standard brands pay a one-time vetting fee for more throughput.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel>Toll-free number</FieldLabel>
              <select
                aria-label="Toll-free number"
                className={SELECT_CLASS}
                defaultValue={props.initialNumberId ?? undefined}
                name="numberId"
              >
                {props.tollFreeNumbers.map((number) => (
                  <option key={number.id} value={number.id}>
                    {number.phoneNumber}
                  </option>
                ))}
              </select>
            </Field>
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
            <select
              aria-label="Company type"
              className={SELECT_CLASS}
              name="companyType"
              onChange={(event) => setCompanyType(event.target.value)}
              value={companyType}
            >
              <option value="PRIVATE_PROFIT">Private company</option>
              <option value="PUBLIC_PROFIT">Public company</option>
              <option value="NON_PROFIT">Non-profit</option>
            </select>
          </Field>
          <TextField
            defaults={defaults}
            description="US: your EIN (12-3456789)."
            label="Tax ID"
            name="taxId"
          />
          <Field>
            <FieldLabel>Tax ID type</FieldLabel>
            <select
              aria-label="Tax ID type"
              className={SELECT_CLASS}
              defaultValue={pick("taxIdType", "EIN")}
              name="taxIdType"
            >
              <option value="EIN">EIN (US)</option>
              <option value="CBN">Business number (Canada)</option>
              <option value="VAT">VAT</option>
              <option value="DUNS">DUNS</option>
            </select>
          </Field>
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
          <TextField defaults={defaults} label="State or region" name="region" placeholder="CA" />
          <TextField defaults={defaults} label="Postal code" name="postalCode" />
          <TextField defaults={defaults} label="Country" name="country" placeholder="US" />
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
          <Field>
            <FieldLabel>Position</FieldLabel>
            <select
              aria-label="Position"
              className={SELECT_CLASS}
              defaultValue={pick("jobPosition", "Director")}
              name="jobPosition"
            >
              {["Director", "GM", "VP", "CEO", "CFO", "General Counsel", "Other"].map(
                (position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ),
              )}
            </select>
          </Field>
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
          <Field>
            <FieldLabel>Use case</FieldLabel>
            <select
              aria-label="Use case"
              className={SELECT_CLASS}
              defaultValue={pick("useCase", useCases[0] ?? "LOW_VOLUME")}
              key={useCases.length}
              name="useCase"
            >
              {useCases.map((useCase) => (
                <option key={useCase} value={useCase}>
                  {SMS_USE_CASE_LABELS[useCase]}
                </option>
              ))}
            </select>
          </Field>
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
              <Field>
                <FieldLabel>Messages a month</FieldLabel>
                <select
                  aria-label="Messages a month"
                  className={SELECT_CLASS}
                  defaultValue={pick("monthlyVolume", "1,000")}
                  name="monthlyVolume"
                >
                  {SMS_MONTHLY_VOLUMES.map((volume) => (
                    <option key={volume} value={volume}>
                      {volume}
                    </option>
                  ))}
                </select>
              </Field>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={defaults.hasEmbeddedLinks === true}
              name="hasEmbeddedLinks"
              type="checkbox"
            />{" "}
            Messages contain links
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={defaults.hasEmbeddedPhone === true}
              name="hasEmbeddedPhone"
              type="checkbox"
            />{" "}
            Messages contain phone numbers
          </label>
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
