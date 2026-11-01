"use client";

import type { AvailableNumber } from "@coss/sms/twilio";
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
import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  type BoughtNumber,
  buyNumberAction,
  releaseNumberAction,
  searchNumbersAction,
  setCountriesAction,
  setReceivingEnvironmentAction,
} from "./actions";

export type EnvironmentOption = { id: string; label: string };

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm shadow-xs/5 outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BuyNumberDialog(props: { orgSlug: string; environments: EnvironmentOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" />}>Buy a number</DialogTrigger>
      <DialogPopup className="sm:max-w-lg">
        <BuyNumber {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function BuyNumber(props: {
  orgSlug: string;
  environments: EnvironmentOption[];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<"local" | "toll_free">("local");
  const [search, searchAction, searching] = useActionState(searchNumbersAction, null);
  // Results belong to the type they were searched as: changing it hides them until a new search.
  const [searchedKind, setSearchedKind] = useState(kind);
  const [state, buyAction, buying] = useActionToast(buyNumberAction, { success: "Number bought" });
  const [chosen, setChosen] = useState<string | null>(null);
  const buyFormId = useId();
  const { onDone } = props;
  // A number that still needs its sender registered says so before the dialog closes.
  useEffect(() => {
    if (state?.ok && !state.data.registerHref) onDone();
  }, [state, onDone]);
  const results: AvailableNumber[] = search?.ok && searchedKind === kind ? search.data : [];

  if (state?.ok && state.data.registerHref) {
    return <RegisterBoughtNumber bought={state.data} registerHref={state.data.registerHref} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Buy a number</DialogTitle>
        <DialogDescription>
          Local numbers send in the US under your A2P 10DLC registration; toll-free numbers need
          their own verification and only reach the US and Canada. Numbers are billed monthly at
          cost.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <form
          action={searchAction}
          className="flex flex-wrap items-end gap-2"
          onSubmit={() => {
            setSearchedKind(kind);
            setChosen(null);
          }}
        >
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <Field className="w-36">
            <FieldLabel>Type</FieldLabel>
            <select
              aria-label="Type"
              className={SELECT_CLASS}
              name="kind"
              onChange={(event) => setKind(event.target.value as "local" | "toll_free")}
              value={kind}
            >
              <option value="local">Local</option>
              <option value="toll_free">Toll-free</option>
            </select>
          </Field>
          <Field className="w-24">
            <FieldLabel>Country</FieldLabel>
            <select aria-label="Country" className={SELECT_CLASS} name="country">
              <option value="US">US</option>
              <option value="CA">CA</option>
            </select>
          </Field>
          {kind === "local" ? (
            <Field className="w-28">
              <FieldLabel>Area code</FieldLabel>
              <Input inputMode="numeric" maxLength={3} name="areaCode" placeholder="415" />
            </Field>
          ) : null}
          <Button loading={searching} type="submit" variant="outline">
            Search
          </Button>
        </form>
        {search && !search.ok ? <FormError message={search.error} /> : null}
        {search?.ok && searchedKind === kind && results.length === 0 ? (
          <p className="text-muted-foreground text-sm">No numbers found. Try another area code.</p>
        ) : null}
        {results.length > 0 ? (
          <form action={buyAction} className="flex flex-col gap-4" id={buyFormId}>
            <input name="orgSlug" type="hidden" value={props.orgSlug} />
            <input name="kind" type="hidden" value={kind} />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 font-medium text-sm">Choose a number</legend>
              {results.map((number) => (
                <label className="flex items-center gap-2 text-sm" key={number.phoneNumber}>
                  <input
                    checked={chosen === number.phoneNumber}
                    name="phoneNumber"
                    onChange={() => setChosen(number.phoneNumber)}
                    type="radio"
                    value={number.phoneNumber}
                  />
                  <span className="font-mono">{number.phoneNumber}</span>
                  {number.locality ? (
                    <span className="text-muted-foreground">
                      {number.locality}, {number.region}
                    </span>
                  ) : null}
                </label>
              ))}
            </fieldset>
            <Field>
              <FieldLabel>Replies go to</FieldLabel>
              <select
                aria-label="Replies go to"
                className={SELECT_CLASS}
                name="receivingEnvironmentId"
              >
                <option value="">No environment (replies are dropped)</option>
                {props.environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.label}
                  </option>
                ))}
              </select>
              <FieldDescription>STOP and START are honored either way.</FieldDescription>
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </form>
        ) : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        {/* Outside the panel (and so the form) to span the popup; tied back with `form`. */}
        <Button
          disabled={results.length === 0 || !chosen}
          form={buyFormId}
          loading={buying}
          type="submit"
        >
          Buy number
        </Button>
      </DialogFooter>
    </>
  );
}

function RegisterBoughtNumber(props: { bought: BoughtNumber; registerHref: string }) {
  const local = props.bought.kind === "local";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Register {props.bought.phoneNumber} to send</DialogTitle>
        <DialogDescription>
          The number is yours, but carriers only deliver messages from registered senders.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex gap-3 rounded-lg border bg-muted/40 p-3.5 text-sm">
          <ShieldCheckIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
          <p className="text-muted-foreground">
            {local
              ? "Local numbers send under your business's US A2P 10DLC registration: one registration covers every local number you buy."
              : "Each toll-free number is verified on its own before it can send."}{" "}
            Tell us about your business and the messages you'll send; carriers usually review it
            within a few days, and the number starts sending once it's approved.
          </p>
        </div>
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Later</DialogClose>
        <Button render={<Link href={props.registerHref} />}>Register sender</Button>
      </DialogFooter>
    </>
  );
}

export function ReceivingEnvironmentForm(props: {
  orgSlug: string;
  numberId: string;
  phoneNumber: string;
  value: string | null;
  environments: EnvironmentOption[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionToast(setReceivingEnvironmentAction, {
    success: "Replies setting saved",
    errors: "toast",
  });
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="numberId" type="hidden" value={props.numberId} />
      <input name="phoneNumber" type="hidden" value={props.phoneNumber} />
      <select
        aria-label="Replies go to"
        className={`${SELECT_CLASS} h-8 max-w-56`}
        defaultValue={props.value ?? ""}
        disabled={props.disabled || pending}
        name="environmentId"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">Dropped</option>
        {props.environments.map((environment) => (
          <option key={environment.id} value={environment.id}>
            {environment.label}
          </option>
        ))}
      </select>
      {state && !state.ok ? <span className="sr-only">{state.error}</span> : null}
    </form>
  );
}

export function ReleaseNumberButton(props: {
  orgSlug: string;
  numberId: string;
  phoneNumber: string;
}) {
  const [state, formAction, pending] = useActionToast(releaseNumberAction, {
    success: `${props.phoneNumber} released`,
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Release
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="numberId" type="hidden" value={props.numberId} />
          <input name="phoneNumber" type="hidden" value={props.phoneNumber} />
          <AlertDialogHeader>
            <AlertDialogTitle>Release {props.phoneNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Messages can no longer be sent from it, and it goes back to the carrier: you may not
              be able to get it again. Its current month isn't refunded.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Release number
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function CountriesForm(props: {
  orgSlug: string;
  countries: { code: string; name: string; price: string; locked: boolean }[];
  allowed: string[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionToast(setCountriesAction, {
    success: "Countries saved",
  });
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <Input
        className="max-w-xs"
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter countries"
        type="search"
        value={filter}
      />
      <div className="grid max-h-80 gap-x-6 gap-y-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {props.countries.map((country) => (
          <Label
            className={`flex items-center gap-2 text-sm ${
              needle && !country.name.toLowerCase().includes(needle) ? "hidden" : ""
            }`}
            key={country.code}
          >
            <Checkbox
              defaultChecked={props.allowed.includes(country.code)}
              disabled={props.disabled || country.locked}
              name="country"
              value={country.code}
            />
            <span>{country.name}</span>
            <span className="text-muted-foreground tabular-nums">{country.price}</span>
            {country.locked ? (
              <span className="text-muted-foreground text-xs">(contact support)</span>
            ) : null}
          </Label>
        ))}
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button disabled={props.disabled} loading={pending} size="sm" type="submit">
          Save countries
        </Button>
      </div>
    </form>
  );
}
