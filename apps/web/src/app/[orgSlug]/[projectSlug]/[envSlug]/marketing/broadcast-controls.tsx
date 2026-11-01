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
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import {
  changeBroadcastAction,
  deleteBroadcastAction,
  sendBroadcastAction,
  testBroadcastAction,
} from "./actions";

type Target = MarketingFormTarget & { broadcastId: string; name: string };

function Hidden(props: Target) {
  return (
    <>
      <TargetInputs {...props} />
      <input name="broadcastId" type="hidden" value={props.broadcastId} />
    </>
  );
}

const MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const utcMinute = (ms: number) => new Date(ms).toISOString().slice(0, 16);

export function SendBroadcastDialog(props: Target & { estimate: number | null }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>Send…</DialogTrigger>
      <DialogPopup>
        <SendForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function SendForm(props: Target & { estimate: number | null }) {
  // On success the page refreshes into the scheduled broadcast, which has no "Send…" button, so
  // the dialog closes by itself.
  const [state, formAction, pending] = useActionState(sendBroadcastAction, null);
  // Rendered only once the dialog opens (client-side), so reading the clock is safe.
  const now = Date.now();
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <DialogHeader>
        <DialogTitle>Send “{props.name}”</DialogTitle>
        <DialogDescription>
          {props.estimate === null
            ? "It goes to every subscribed contact of its audience or segment."
            : `It goes to about ${props.estimate.toLocaleString("en-US")} subscribed contacts.`}{" "}
          Its content can't be changed once it starts.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <Field>
          <FieldLabel>Send at (UTC)</FieldLabel>
          <Input
            max={utcMinute(now + MAX_AHEAD_MS)}
            min={utcMinute(now)}
            name="scheduledAt"
            type="datetime-local"
          />
          <FieldDescription>Leave empty to start now (at most 30 days ahead).</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Send broadcast
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TestBroadcastDialog(props: Target) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Send test</DialogTrigger>
      <DialogPopup>
        <TestForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function TestForm(props: Target) {
  const [state, formAction, pending] = useActionState(testBroadcastAction, null);
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Test sent</DialogTitle>
          <DialogDescription>
            {state.data.count === 1 ? "One test email is" : `${state.data.count} test emails are`}{" "}
            on the way; they appear under Emails.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <form action={formAction} className="contents">
      <Hidden {...props} />
      <DialogHeader>
        <DialogTitle>Send a test</DialogTitle>
        <DialogDescription>
          Its content, with “[Test]” before the subject. Test emails count like any send.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>To</FieldLabel>
          <Input autoFocus name="to" placeholder="you@example.com, a colleague…" required />
          <FieldDescription>
            Up to 5 verified members of this organization, comma-separated.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Fill in as</FieldLabel>
          <Input name="contact" placeholder="A contact's address (default: the fallbacks)" />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Send test
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Pause or resume (one click). */
export function BroadcastChangeButton(props: Target & { change: "pause" | "resume" }) {
  const [state, formAction, pending] = useActionState(changeBroadcastAction, null);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Hidden {...props} />
      <input name="change" type="hidden" value={props.change} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        {props.change === "pause" ? "Pause" : "Resume"}
      </Button>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}

export function CancelBroadcastButton(props: Target) {
  const [state, formAction, pending] = useActionState(changeBroadcastAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Cancel broadcast
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <input name="change" type="hidden" value="cancel" />
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops for good: emails not yet handed to the provider are dropped. Emails already
              on their way still arrive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? (
            <div className="px-6">
              <FormError message={state.error} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep sending</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Cancel broadcast
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function DeleteBroadcastButton(props: Target) {
  const [state, formAction, pending] = useActionState(deleteBroadcastAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>Delete</AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The draft is removed for good.</AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? (
            <div className="px-6">
              <FormError message={state.error} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep it</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
