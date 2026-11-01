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
import { PlusIcon } from "lucide-react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { addDomainAction } from "./actions";

export function AddDomainDialog({ orgSlug }: { orgSlug: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon />
        Add domain
      </DialogTrigger>
      <DialogPopup>
        <AddDomainForm orgSlug={orgSlug} />
      </DialogPopup>
    </Dialog>
  );
}

function AddDomainForm({ orgSlug }: { orgSlug: string }) {
  // On success the action redirects to the new domain's page.
  const [state, formAction, pending] = useActionToast(addDomainAction, {
    success: { title: "Domain added", description: "Publish its DNS records to start sending." },
  });

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <DialogHeader>
        <DialogTitle>Add a domain</DialogTitle>
        <DialogDescription>
          You'll get DNS records to publish. Once they're found, live API keys can send from any
          address at this domain.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Domain</FieldLabel>
          <Input autoFocus name="name" placeholder="acme.com" required />
          <FieldDescription>
            A subdomain such as mail.acme.com keeps this sending separate from your other email.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Add domain
        </Button>
      </DialogFooter>
    </form>
  );
}
