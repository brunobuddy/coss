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
import { Textarea } from "@coss/ui/components/textarea";
import {
  BuildingIcon,
  ClipboardListIcon,
  CoinsIcon,
  CreditCardIcon,
  FileTextIcon,
  FolderSyncIcon,
  KeyIcon,
  KeyRoundIcon,
  type LucideIcon,
  MonitorSmartphoneIcon,
  ReceiptIcon,
  RocketIcon,
  ShieldIcon,
  SmartphoneIcon,
  TimerIcon,
  UserCogIcon,
  UserPlusIcon,
  UserRoundIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import type { ActionResult } from "@/lib/action-result";
import { type ToastContent, useActionToast } from "@/lib/toast";

const ICONS = {
  apiKey: KeyIcon,
  billing: CreditCardIcon,
  contract: FileTextIcon,
  credit: CoinsIcon,
  deploy: RocketIcon,
  directory: FolderSyncIcon,
  form: ClipboardListIcon,
  invoice: ReceiptIcon,
  organization: BuildingIcon,
  rateLimit: TimerIcon,
  role: UserCogIcon,
  session: MonitorSmartphoneIcon,
  signUp: UserPlusIcon,
  sso: KeyRoundIcon,
  twoFactor: SmartphoneIcon,
  user: UserRoundIcon,
} satisfies Record<string, LucideIcon>;

type AdminAction = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

type Props = {
  action: AdminAction;
  /** Ids the action needs, sent as hidden inputs. */
  fields: Record<string, string>;
  triggerLabel: string;
  title: string;
  /** What the dialog is about, by name: pages are server components, which can't pass a component. */
  icon?: keyof typeof ICONS;
  description: ReactNode;
  submitLabel: string;
  /** Toast shown once the action succeeded (e.g. "Organization suspended"). */
  success: string | ToastContent;
  /** `required` blocks submitting without one; either way it is stored in the audit log. */
  reason: "required" | "optional";
  reasonPlaceholder?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Extra form controls (e.g. a duration). */
  children?: ReactNode;
};

/**
 * A button that opens a confirm dialog with a reason field, then runs an audited admin action and
 * toasts `success` (failures stay in the dialog).
 */
export function AdminActionDialog(props: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        disabled={props.disabled}
        render={
          <Button size="sm" variant={props.destructive ? "destructive-outline" : "outline"} />
        }
      >
        {props.triggerLabel}
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form state. */}
        <AdminActionForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function AdminActionForm(props: Props & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(props.action, { success: props.success });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      {Object.entries(props.fields).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <DialogHeader>
        <DialogIcon
          icon={props.icon ? ICONS[props.icon] : ShieldIcon}
          tone={props.destructive ? "danger" : undefined}
        />
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        {props.children}
        <Field>
          <FieldLabel>Reason{props.reason === "optional" ? " (optional)" : ""}</FieldLabel>
          <Textarea
            maxLength={500}
            name="reason"
            placeholder={props.reasonPlaceholder}
            required={props.reason === "required"}
            rows={3}
          />
          <FieldDescription>
            Kept in the admin audit log; never shown to the customer.
          </FieldDescription>
        </Field>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button
          loading={pending}
          type="submit"
          variant={props.destructive ? "destructive" : "default"}
        >
          {props.submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
