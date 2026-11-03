"use client";

import { Button } from "@coss/ui/components/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import type { ComponentProps, ReactNode } from "react";
import { useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { useActionToast } from "@/lib/toast";

type Action = (
  previous: ActionResult<null> | null,
  formData: FormData,
) => Promise<ActionResult<null>>;

function Fields(props: { hidden: Record<string, string> }) {
  return Object.entries(props.hidden).map(([name, value]) => (
    <input key={name} name={name} type="hidden" value={value} />
  ));
}

/** One click on a ticket: a button, its fields, a toast. */
export function SupportActionButton(props: {
  action: Action;
  hidden: Record<string, string>;
  success: string;
  children: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  id?: string;
  className?: string;
}) {
  const [, formAction, pending] = useActionToast(props.action, {
    success: props.success,
    errors: "toast",
  });
  return (
    <form action={formAction} className={props.className}>
      <Fields hidden={props.hidden} />
      <Button
        id={props.id}
        loading={pending}
        size={props.size ?? "sm"}
        type="submit"
        variant={props.variant ?? "outline"}
      >
        {props.children}
      </Button>
    </form>
  );
}

/** A ticket's property: choosing a value saves it. */
export function SupportSelect(props: {
  action: Action;
  hidden: Record<string, string>;
  name: string;
  value: string;
  label: string;
  items: { value: string; label: string }[];
  success: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [, formAction] = useActionToast(props.action, { success: props.success, errors: "toast" });
  return (
    <form action={formAction} ref={form}>
      <Fields hidden={props.hidden} />
      <Select
        items={props.items}
        key={props.value}
        name={props.name}
        defaultValue={props.value}
        onValueChange={() => {
          // Let the field take its new value first.
          queueMicrotask(() => form.current?.requestSubmit());
        }}
      >
        <SelectTrigger aria-label={props.label} size="sm">
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
    </form>
  );
}
