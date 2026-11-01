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
import { Textarea } from "@coss/ui/components/textarea";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  createInboxAction,
  deleteInboxAction,
  deleteInboxThreadAction,
  replyToInboxMessageAction,
  updateInboxAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };
type InboxTarget = EnvTarget & { inboxId: string };

function Hidden(props: Record<string, string>) {
  return (
    <>
      {Object.entries(props).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
    </>
  );
}

/** `domains`: where an inbox can live, the environment's managed domain first (value `""`). */
export function CreateInboxDialog(
  props: EnvTarget & { domains: { value: string; label: string }[] },
) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Create inbox</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form. */}
        <CreateInboxForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function CreateInboxForm(props: EnvTarget & { domains: { value: string; label: string }[] }) {
  const { domains, ...target } = props;
  const [state, formAction, pending] = useActionState(createInboxAction, null);
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Inbox created</DialogTitle>
          <DialogDescription>
            Mail to it shows up as threads, and each message sends an inbox.message.received
            webhook.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            render={
              <Link
                href={`/${target.orgSlug}/${target.projectSlug}/${target.envSlug}/inboxes/${state.data.id}`}
              />
            }
          >
            View inbox
          </Button>
        </DialogFooter>
      </>
    );
  }
  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <Hidden {...target} />
      <DialogHeader>
        <DialogTitle>Create an inbox</DialogTitle>
        <DialogDescription>
          An email address for an agent (or anyone): mail to it is kept as threads, and replies go
          out from it.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Username</FieldLabel>
          <Input
            autoFocus
            maxLength={64}
            name="username"
            placeholder="Optional, e.g. support-agent"
          />
          <FieldDescription>
            The part before the @: lower-case letters, digits, dots, underscores or dashes. Random
            when empty.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Domain</FieldLabel>
          <Select defaultValue={domains[0]?.value ?? ""} items={domains} name="domain">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {domains.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <FieldDescription>
            Live environments send only from inboxes at your own verified domains.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Display name</FieldLabel>
          <Input maxLength={64} name="displayName" placeholder="Optional, e.g. Acme Support" />
          <FieldDescription>The name messages from the inbox are sent with.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Client ID</FieldLabel>
          <Input maxLength={128} name="clientId" placeholder="Optional, e.g. agent-42" />
          <FieldDescription>Your own id for it, unique in this environment.</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create inbox
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RenameInboxDialog(props: InboxTarget & { displayName: string | null }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Rename</DialogTrigger>
      <DialogPopup>
        <RenameInboxForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function RenameInboxForm(props: InboxTarget & { displayName: string | null }) {
  const { displayName, ...target } = props;
  const [state, formAction, pending] = useActionToast(updateInboxAction, {
    success: "Inbox renamed",
  });
  return (
    <form action={formAction} className="contents">
      <Hidden {...target} />
      <DialogHeader>
        <DialogTitle>Rename the inbox</DialogTitle>
        <DialogDescription>
          The name messages are sent with. Its address never changes.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <Field>
          <FieldLabel>Display name</FieldLabel>
          <Input
            autoFocus
            defaultValue={displayName ?? ""}
            maxLength={64}
            name="displayName"
            placeholder="Empty: the bare address"
          />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteInboxButton(props: InboxTarget & { address: string }) {
  const { address, ...target } = props;
  const [state, formAction, pending] = useActionToast(deleteInboxAction, {
    success: "Inbox deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {address}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its threads are deleted. Their emails stay in the environment until their retention
              ends, and mail to the address is still received, without a thread or webhook of its
              own. This can&apos;t be undone.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete inbox
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteThreadButton(props: InboxTarget & { threadId: string }) {
  const [state, formAction, pending] = useActionToast(deleteInboxThreadAction, {
    success: "Thread deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this thread?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation leaves the inbox; a later reply starts a new thread. Its emails stay
              in the environment until their retention ends.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete thread
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

/** Replies to `messageId` (the thread's latest message) from the inbox's address. */
export function ReplyForm(props: InboxTarget & { messageId: string; to: string }) {
  const { to, ...target } = props;
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionToast(replyToInboxMessageAction, {
    success: "Reply sent",
  });
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-3" ref={form}>
      <Hidden {...target} />
      <Field>
        <FieldLabel>Reply to {to}</FieldLabel>
        <Textarea name="text" required rows={5} />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox name="replyAll" value="on" />
          Reply to everyone on the message
        </Label>
        <Button loading={pending} size="sm" type="submit">
          Send reply
        </Button>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
