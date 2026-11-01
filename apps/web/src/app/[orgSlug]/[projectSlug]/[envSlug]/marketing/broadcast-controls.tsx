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
import { MegaphoneIcon, SendIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { UtcDateTimeField } from "@/components/fields/date-field";
import { Segmented } from "@/components/fields/segmented";
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
  const [when, setWhen] = useState("now");
  const [missing, setMissing] = useState(false);
  return (
    <form
      action={formAction}
      className="contents"
      onSubmit={(event) => {
        // An empty time would mean "now" to the action.
        const blank = when === "later" && !new FormData(event.currentTarget).get("scheduledAt");
        setMissing(blank);
        if (blank) event.preventDefault();
      }}
    >
      <Hidden {...props} />
      <DialogHeader>
        <DialogIcon icon={SendIcon} />
        <DialogTitle>Send “{props.name}”</DialogTitle>
        <DialogDescription>
          {props.estimate === null
            ? "It goes to every subscribed contact of its audience or segment."
            : `It goes to about ${props.estimate.toLocaleString("en-US")} subscribed contacts.`}{" "}
          Its content can't be changed once it starts.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Send</FieldLabel>
          <Segmented
            aria-label="When to send"
            onValueChange={setWhen}
            options={[
              { value: "now", label: "Now" },
              { value: "later", label: "Later" },
            ]}
            value={when}
          />
        </Field>
        {when === "later" ? (
          <Field>
            <FieldLabel>Send at</FieldLabel>
            <UtcDateTimeField name="scheduledAt" required />
            <FieldDescription>At most 30 days ahead.</FieldDescription>
          </Field>
        ) : null}
        {missing ? (
          <FormError message="Choose a day to send it on." />
        ) : state && !state.ok ? (
          <FormError message={state.error} />
        ) : null}
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

type TestProps = Target & {
  /** Verified members' addresses: the only recipients allowed. */
  recipients: string[];
  currentUserEmail: string;
};

export function TestBroadcastDialog(props: TestProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Send test</DialogTrigger>
      <DialogPopup>
        <TestForm {...props} />
      </DialogPopup>
    </Dialog>
  );
}

function TestForm(props: TestProps) {
  const [state, formAction, pending] = useActionState(testBroadcastAction, null);
  const [to, setTo] = useState<Set<string>>(
    new Set(props.recipients.includes(props.currentUserEmail) ? [props.currentUserEmail] : []),
  );
  if (state?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={SendIcon} />
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
      <input name="to" type="hidden" value={[...to].join(", ")} />
      <DialogHeader>
        <DialogIcon icon={SendIcon} />
        <DialogTitle>Send a test</DialogTitle>
        <DialogDescription>
          Its content, with “[Test]” before the subject. Test emails count like any send.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-sm">To (up to 5 verified members)</legend>
          {props.recipients.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No member of this organization has a verified address yet.
            </p>
          ) : null}
          {props.recipients.map((address) => (
            <Label className="gap-2 font-normal" key={address}>
              <Checkbox
                checked={to.has(address)}
                onCheckedChange={(checked) =>
                  setTo((current) => {
                    const next = new Set(current);
                    if (checked) next.add(address);
                    else next.delete(address);
                    return next;
                  })
                }
              />
              {address}
            </Label>
          ))}
        </fieldset>
        <Field>
          <FieldLabel>Fill in as</FieldLabel>
          <Input name="contact" placeholder="A contact's address (default: the fallbacks)" />
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button disabled={to.size === 0 || to.size > 5} loading={pending} type="submit">
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
            <DialogIcon icon={MegaphoneIcon} tone="danger" />
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
            <DialogIcon icon={MegaphoneIcon} tone="danger" />
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
