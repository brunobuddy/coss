"use client";

import { Button } from "@coss/ui/components/button";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Textarea } from "@coss/ui/components/textarea";
import { useEffect, useRef } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { saveSavedReplyAction } from "../actions";

export function SavedReplyForm() {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionToast(saveSavedReplyAction, {
    success: "Saved reply added",
  });
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3" ref={form}>
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input maxLength={80} name="title" placeholder="DMARC setup" required />
      </Field>
      <Field>
        <FieldLabel>Reply</FieldLabel>
        <Textarea name="body" required rows={5} />
      </Field>
      <div className="flex justify-end">
        <Button loading={pending} size="sm" type="submit">
          Add saved reply
        </Button>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
