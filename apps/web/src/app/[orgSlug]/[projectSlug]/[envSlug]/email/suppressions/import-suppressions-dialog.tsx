"use client";

import { Button } from "@coss/ui/components/button";
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
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { type ImportSuppressionsResult, importSuppressionsAction } from "./actions";
import { MAX_IMPORT_ROWS } from "./import-limits";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

export function ImportSuppressionsDialog(props: Target) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Import CSV</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <ImportSuppressionsForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun : nouns}`;
}

function ImportSummary({ result }: { result: ImportSuppressionsResult }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import finished</DialogTitle>
        <DialogDescription>
          {plural(result.created, "address", "addresses")} added
          {result.existing > 0
            ? `, ${result.existing.toLocaleString("en-US")} already suppressed`
            : ""}
          {result.invalidCount > 0 ? `, ${plural(result.invalidCount, "row")} skipped` : ""}.
        </DialogDescription>
      </DialogHeader>
      {result.invalid.length > 0 ? (
        <DialogPanel className="flex flex-col gap-2">
          <p className="font-medium text-sm">Skipped rows</p>
          <ul className="flex flex-col gap-1 text-sm">
            {result.invalid.map((row) => (
              <li className="text-muted-foreground" key={row.line}>
                <span className="text-foreground">Line {row.line}</span>
                {row.address ? <> ({row.address})</> : null}: {row.message}
              </li>
            ))}
          </ul>
          {result.invalidCount > result.invalid.length ? (
            <p className="text-muted-foreground text-xs">
              and {plural(result.invalidCount - result.invalid.length, "more row")}.
            </p>
          ) : null}
        </DialogPanel>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button />}>Done</DialogClose>
      </DialogFooter>
    </>
  );
}

function ImportSuppressionsForm(props: Target) {
  const [state, formAction, pending] = useActionToast(importSuppressionsAction, {
    success: (result) => `${plural(result.created, "address", "addresses")} suppressed`,
  });

  if (state?.ok) return <ImportSummary result={state.data} />;

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <DialogHeader>
        <DialogTitle>Import suppressions</DialogTitle>
        <DialogDescription>
          Upload a CSV with an <code>address</code> (or <code>email</code>) column and an optional{" "}
          <code>scope</code> column, such as an export of this list, or one address per line. Up to{" "}
          {MAX_IMPORT_ROWS.toLocaleString("en-US")} rows; invalid rows are skipped.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>CSV file</FieldLabel>
          <Input accept=".csv,text/csv,text/plain" name="file" required type="file" />
        </Field>
        <Field>
          <FieldLabel>Category</FieldLabel>
          <Input maxLength={256} name="category" placeholder="All emails" />
          <FieldDescription>
            For rows without a scope. Leave empty to suppress every email.
          </FieldDescription>
        </Field>
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
