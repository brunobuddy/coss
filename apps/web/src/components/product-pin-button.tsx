"use client";

import { PinIcon, PinOffIcon } from "lucide-react";
import { startTransition } from "react";
import { setProductPreferenceAction } from "@/app/[orgSlug]/actions";
import { useActionToast } from "@/lib/toast";

/**
 * Adds a product to the member's sidebar or takes it off: pinning or hiding it, or going back to
 * showing it while in use when that already gives the wanted result.
 */
export function ProductPinButton(props: {
  orgSlug: string;
  product: { key: string; name: string };
  visible: boolean;
  inUse: boolean;
  preference: boolean | undefined;
}) {
  const [, action, pending] = useActionToast(setProductPreferenceAction, {
    errors: "toast",
    success: props.visible
      ? `${props.product.name} removed from your sidebar`
      : `${props.product.name} added to your sidebar`,
  });
  const choice = props.visible
    ? props.preference === true && !props.inUse
      ? "reset"
      : "hide"
    : props.preference === false && props.inUse
      ? "reset"
      : "pin";
  const label = props.visible ? "Remove from sidebar" : "Add to sidebar";
  const Icon = props.visible ? PinOffIcon : PinIcon;
  return (
    <button
      aria-label={`${label}: ${props.product.name}`}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        const formData = new FormData();
        formData.set("orgSlug", props.orgSlug);
        formData.set("product", props.product.key);
        formData.set("choice", choice);
        startTransition(() => action(formData));
      }}
      title={label}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}
