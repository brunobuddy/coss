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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { BracesIcon, FileUpIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { DateField } from "@/components/fields/date-field";
import { Segmented } from "@/components/fields/segmented";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { useActionToast } from "@/lib/toast";
import { MAX_IMPORT_ROWS } from "../../email/suppressions/import-limits";
import {
  addContactAction,
  createContactPropertyAction,
  deleteContactAction,
  deleteContactPropertyAction,
  type ImportContactsResult,
  importContactsAction,
} from "./actions";

export function AddContactDialog(props: MarketingFormTarget & { base: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add contact</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <AddContactForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function AddContactForm(props: MarketingFormTarget & { base: string }) {
  const [state, formAction, pending] = useActionToast(addContactAction, {
    success: (data) => (data.created ? "Contact added" : "Contact updated"),
  });
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={UserRoundIcon} />
          <DialogTitle>{state.data.created ? "Contact added" : "Contact updated"}</DialogTitle>
          <DialogDescription>
            {state.data.created
              ? "The contact is in this environment's list."
              : "A contact with this address already existed; its names were updated."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            render={<Link href={`${props.base}/marketing/contacts/${state.data.id}`} />}
            variant="ghost"
          >
            View contact
          </Button>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogIcon icon={UserRoundIcon} />
        <DialogTitle>Add a contact</DialogTitle>
        <DialogDescription>
          Only add people who agreed to hear from you. Custom properties can be set on the contact's
          page.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Email address</FieldLabel>
          <Input autoFocus name="email" placeholder="ada@example.com" required type="email" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>First name</FieldLabel>
            <Input maxLength={256} name="firstName" />
          </Field>
          <Field>
            <FieldLabel>Last name</FieldLabel>
            <Input maxLength={256} name="lastName" />
          </Field>
        </div>
        <Label>
          <Checkbox name="unsubscribed" value="on" />
          Unsubscribed (keep them on the list without sending them marketing email)
        </Label>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add contact
        </Button>
      </DialogFooter>
    </form>
  );
}

function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun : nouns}`;
}

function ImportSummary({ result }: { result: ImportContactsResult }) {
  return (
    <>
      <DialogHeader>
        <DialogIcon icon={FileUpIcon} />
        <DialogTitle>Import finished</DialogTitle>
        <DialogDescription>
          {plural(result.created, "contact")} added, {plural(result.updated, "contact")} updated
          {result.invalidCount > 0 ? `, ${plural(result.invalidCount, "row")} skipped` : ""}.
          {result.keptUnsubscribed > 0
            ? ` ${plural(result.keptUnsubscribed, "contact")} stayed unsubscribed: imports never re-subscribe anyone.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      {result.invalid.length > 0 || result.ignoredColumns.length > 0 ? (
        <DialogPanel className="flex flex-col gap-2">
          {result.ignoredColumns.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Ignored columns (not a contact property): {result.ignoredColumns.join(", ")}.
            </p>
          ) : null}
          {result.invalid.length > 0 ? (
            <>
              <p className="font-medium text-sm">Skipped rows</p>
              <ul className="flex flex-col gap-1 text-sm">
                {result.invalid.map((row) => (
                  <li className="text-muted-foreground" key={`${row.line}-${row.email}`}>
                    <span className="text-foreground">Line {row.line}</span>
                    {row.email ? <> ({row.email})</> : null}: {row.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </DialogPanel>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button />}>Done</DialogClose>
      </DialogFooter>
    </>
  );
}

export function ImportContactsDialog(
  props: MarketingFormTarget & { audiences: { id: string; name: string }[] },
) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Import CSV</DialogTrigger>
      <DialogPopup>
        <ImportContactsForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

const NO_AUDIENCE = "none";

function ImportContactsForm(
  props: MarketingFormTarget & { audiences: { id: string; name: string }[] },
) {
  const [state, formAction, pending] = useActionToast(importContactsAction, {
    success: "Contacts imported",
  });
  if (state?.ok) return <ImportSummary result={state.data} />;
  return (
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogIcon icon={FileUpIcon} />
        <DialogTitle>Import contacts</DialogTitle>
        <DialogDescription>
          Upload a CSV with an <code>email</code> column and optional <code>first_name</code>,{" "}
          <code>last_name</code>, <code>status</code> and custom property columns (such as an export
          of these contacts), or one address per line. Up to{" "}
          {MAX_IMPORT_ROWS.toLocaleString("en-US")} rows; invalid rows are skipped and nobody who
          unsubscribed is re-subscribed.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>CSV file</FieldLabel>
          <Input accept=".csv,text/csv,text/plain" name="file" required type="file" />
        </Field>
        {props.audiences.length > 0 ? (
          <Field>
            <FieldLabel>Add to audience</FieldLabel>
            <Select
              defaultValue={NO_AUDIENCE}
              items={[
                { value: NO_AUDIENCE, label: "None" },
                ...props.audiences.map((audience) => ({
                  value: audience.id,
                  label: audience.name,
                })),
              ]}
              name="audienceId"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value={NO_AUDIENCE}>None</SelectItem>
                {props.audiences.map((audience) => (
                  <SelectItem key={audience.id} value={audience.id}>
                    {audience.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <FieldDescription>Every imported contact joins it.</FieldDescription>
          </Field>
        ) : null}
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Import
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteContactButton(
  props: MarketingFormTarget & { contactId: string; email: string },
) {
  const [state, formAction, pending] = useActionToast(deleteContactAction, {
    success: "Contact deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete contact
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="contactId" type="hidden" value={props.contactId} />
          <AlertDialogHeader>
            <DialogIcon icon={UserRoundIcon} tone="danger" />
            <AlertDialogTitle>Delete {props.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              The contact leaves every audience and its topic choices are forgotten. Its
              suppressions stay. To stop marketing email but keep the record, unsubscribe it
              instead.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete contact
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

const PROPERTY_TYPES = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True / false" },
  { value: "date", label: "Date" },
];

const NO_FALLBACK = "none";

/** The fallback in the type's own control; posts what `typedText` reads ("" for none). */
function FallbackInput(props: { type: string }) {
  const [flag, setFlag] = useState(NO_FALLBACK);
  if (props.type === "boolean") {
    return (
      <div>
        <input name="fallback" type="hidden" value={flag === NO_FALLBACK ? "" : flag} />
        <Segmented
          aria-label="Fallback"
          onValueChange={setFlag}
          options={[
            { value: NO_FALLBACK, label: "None" },
            { value: "true", label: "True" },
            { value: "false", label: "False" },
          ]}
          value={flag}
        />
      </div>
    );
  }
  if (props.type === "date") return <DateField name="fallback" placeholder="None" />;
  return (
    <Input
      maxLength={2000}
      name="fallback"
      placeholder="None"
      step={props.type === "number" ? "any" : undefined}
      type={props.type === "number" ? "number" : "text"}
    />
  );
}

export function CreatePropertyDialog(props: MarketingFormTarget) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Add property</DialogTrigger>
      <DialogPopup>
        <CreatePropertyForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreatePropertyForm(props: MarketingFormTarget) {
  const [state, formAction, pending] = useActionToast(createContactPropertyAction, {
    success: "Property added",
  });
  const [type, setType] = useState("string");
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={BracesIcon} />
          <DialogTitle>Property added</DialogTitle>
          <DialogDescription>Contacts can now have it; templates can use it.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      <DialogHeader>
        <DialogIcon icon={BracesIcon} />
        <DialogTitle>Add a contact property</DialogTitle>
        <DialogDescription>
          Its key and type can't change later. Templates use it as{" "}
          <code>{"{{{contact.key}}}"}</code>.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Key</FieldLabel>
          <Input
            autoFocus
            maxLength={50}
            name="key"
            pattern="[a-z][a-z0-9_]{0,49}"
            placeholder="plan"
            required
          />
          <FieldDescription>Lower-case letters, digits and underscores.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Type</FieldLabel>
          <Segmented
            aria-label="Type"
            name="type"
            onValueChange={setType}
            options={PROPERTY_TYPES}
            value={type}
          />
        </Field>
        <Field>
          <FieldLabel>Fallback</FieldLabel>
          <FallbackInput key={type} type={type} />
          <FieldDescription>What templates show for contacts without a value.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add property
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeletePropertyButton(
  props: MarketingFormTarget & { propertyId: string; propertyKey: string },
) {
  const [state, formAction, pending] = useActionToast(deleteContactPropertyAction, {
    success: "Property deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="propertyId" type="hidden" value={props.propertyId} />
          <AlertDialogHeader>
            <DialogIcon icon={BracesIcon} tone="danger" />
            <AlertDialogTitle>Delete “{props.propertyKey}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every contact's value is removed. Templates using it render the empty string.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete property
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
