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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useActionState, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { type MarketingFormTarget, TargetInputs } from "@/components/marketing";
import { deleteTopicAction, saveTopicAction } from "./actions";

type TopicValues = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  default_subscription: "opt_in" | "opt_out";
  visibility: "public" | "private";
  position: number;
};

const DEFAULTS = [
  { value: "opt_in", label: "Opt-in by default (everyone subscribed gets it)" },
  { value: "opt_out", label: "Opt-out by default (only those who opt in get it)" },
];
const VISIBILITIES = [
  { value: "public", label: "Public (shown in the preference center)" },
  { value: "private", label: "Private (hidden from the preference center)" },
];

function Choice(props: { name: string; defaultValue: string; items: typeof DEFAULTS }) {
  return (
    <Select defaultValue={props.defaultValue} items={props.items} name={props.name}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {props.items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

/** Creates a topic (no `topic`) or edits one. */
export function TopicDialog(props: MarketingFormTarget & { topic?: TopicValues }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size={props.topic ? "xs" : "sm"} variant={props.topic ? "outline" : "default"} />
        }
      >
        {props.topic ? "Edit" : "New topic"}
      </DialogTrigger>
      <DialogPopup>
        <TopicForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function TopicForm(props: MarketingFormTarget & { topic?: TopicValues; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(saveTopicAction, null);
  const { onDone } = props;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const topic = props.topic;
  return (
    <form action={formAction} className="contents">
      <TargetInputs {...props} />
      {topic ? <input name="topicId" type="hidden" value={topic.id} /> : null}
      <DialogHeader>
        <DialogTitle>{topic ? `Edit “${topic.name}”` : "New topic"}</DialogTitle>
        <DialogDescription>
          Emails sent with <code>category</code> equal to the topic's key are about it: contacts who
          don't get the topic are skipped, and they get a one-click unsubscribe for it.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {topic ? null : (
          <Field>
            <FieldLabel>Key</FieldLabel>
            <Input autoFocus maxLength={256} name="key" placeholder="newsletter" required />
            <FieldDescription>The emails' category; can't change later.</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input defaultValue={topic?.name} maxLength={200} name="name" required />
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Input defaultValue={topic?.description ?? ""} maxLength={500} name="description" />
        </Field>
        <Field>
          <FieldLabel>Subscription</FieldLabel>
          <Choice
            defaultValue={topic?.default_subscription ?? "opt_in"}
            items={DEFAULTS}
            name="defaultSubscription"
          />
        </Field>
        <Field>
          <FieldLabel>Visibility</FieldLabel>
          <Choice
            defaultValue={topic?.visibility ?? "public"}
            items={VISIBILITIES}
            name="visibility"
          />
        </Field>
        <Field>
          <FieldLabel>Position</FieldLabel>
          <Input
            defaultValue={topic ? String(topic.position) : ""}
            inputMode="numeric"
            name="position"
            placeholder="0"
          />
          <FieldDescription>Order in the preference center (ascending).</FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          {topic ? "Save topic" : "Create topic"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteTopicButton(props: MarketingFormTarget & { topicId: string; name: string }) {
  const [state, formAction, pending] = useActionState(deleteTopicAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="xs" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <TargetInputs {...props} />
          <input name="topicId" type="hidden" value={props.topicId} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{props.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Every contact's choice for it is forgotten. Emails with its category are then sent
              like any other.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete topic
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
