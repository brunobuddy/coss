"use client";

import type { ReputationPolicy } from "@coss/reputation/schemas";
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
import { Textarea } from "@coss/ui/components/textarea";
import { GaugeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/panel";
import type { ActionResult } from "@/lib/action-result";
import { useActionToast } from "@/lib/toast";
import {
  reinstateMarketingAction,
  reinstateOrganizationAction,
  suspendOrganizationAction,
  updatePolicyAction,
} from "./actions";

type NoteAction = (previous: ActionResult | null, formData: FormData) => Promise<ActionResult>;

type NoteDialogProps = {
  organizationId: string;
  action: NoteAction;
  trigger: string;
  title: string;
  description: string;
  submit: string;
  /** Toast shown once the action succeeded. */
  success: string;
  destructive?: boolean;
};

function NoteDialog(props: NoteDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm" variant={props.destructive ? "destructive-outline" : "default"} />
        }
      >
        {props.trigger}
      </DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which also resets the form state. */}
        <NoteForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function NoteForm(props: NoteDialogProps & { onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(props.action, { success: props.success });
  const { onDone } = props;

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="organizationId" type="hidden" value={props.organizationId} />
      <DialogHeader>
        <DialogIcon icon={GaugeIcon} tone={props.destructive ? "danger" : undefined} />
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.description}</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <Field>
          <FieldLabel>Note</FieldLabel>
          <Textarea maxLength={2000} name="note" required />
          <FieldDescription>Kept in the organization's history (admins only).</FieldDescription>
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
          {props.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReinstateButton({ organizationId }: { organizationId: string }) {
  return (
    <NoteDialog
      action={reinstateOrganizationAction}
      description="Live sending resumes immediately. Rates are measured again from now on, so the sending that caused the suspension can't suspend the organization again. An account suspension (Overview) is separate and stays as it is."
      organizationId={organizationId}
      submit="Reinstate live sending"
      success="Live sending reinstated"
      title="Reinstate live sending?"
      trigger="Reinstate live sending"
    />
  );
}

export function ReinstateMarketingButton({ organizationId }: { organizationId: string }) {
  return (
    <NoteDialog
      action={reinstateMarketingAction}
      description="Marketing sends (broadcasts, sends with stream marketing) resume immediately. Marketing rates are measured again from now on. The organization's live webhook endpoints receive account.marketing_reinstated."
      organizationId={organizationId}
      submit="Resume marketing"
      success="Marketing sending resumed"
      title="Resume marketing sending?"
      trigger="Resume marketing"
    />
  );
}

export function SuspendButton({ organizationId }: { organizationId: string }) {
  return (
    <NoteDialog
      action={suspendOrganizationAction}
      description="Live sends are refused with account_suspended and new live keys can't be created until an admin reinstates the organization. Sandbox keys and the dashboard keep working, and the customer is told: owners and admins get an email and live webhook endpoints receive account.suspended. To stop everything, or for abuse, use Suspend account or Take down & report on the Overview tab instead."
      destructive
      organizationId={organizationId}
      submit="Suspend live sending"
      success="Live sending suspended"
      title="Suspend live sending?"
      trigger="Suspend live sending"
    />
  );
}

const percent = (rate: number) => String(Number((rate * 100).toFixed(4)));

/**
 * Per-organization policy overrides. Empty fields use the default (shown as the placeholder);
 * `current` is the stored overrides' effect, so a saved value shows as the field's value.
 */
export function PolicyForm(props: {
  organizationId: string;
  defaults: ReputationPolicy;
  overrides: Partial<{
    windowDays: number;
    bounceRate: Partial<ReputationPolicy["bounceRate"]>;
    complaintRate: Partial<ReputationPolicy["complaintRate"]>;
    marketingBounceRate: Partial<ReputationPolicy["marketingBounceRate"]>;
    marketingComplaintRate: Partial<ReputationPolicy["marketingComplaintRate"]>;
    countSimulatorRecipients: boolean;
    contentScreening: Partial<ReputationPolicy["contentScreening"]>;
    hookFailureRate: Partial<ReputationPolicy["hookFailureRate"]>;
    smsOptOutRate: Partial<ReputationPolicy["smsOptOutRate"]>;
    smsFilteredRate: Partial<ReputationPolicy["smsFilteredRate"]>;
  }> | null;
}) {
  // Which submit button was used (both post to the same action): state for its spinner, and a ref
  // for the toast, since the click's update hasn't rendered yet when the form dispatches.
  const [intent, setIntent] = useState<"save" | "reset">("save");
  const intentRef = useRef(intent);
  const choose = (next: "save" | "reset") => {
    intentRef.current = next;
    setIntent(next);
  };
  const [state, formAction, pending] = useActionToast(updatePolicyAction, {
    success: () => (intentRef.current === "reset" ? "Policy reset to defaults" : "Policy saved"),
  });
  const { defaults } = props;
  const overrides = props.overrides ?? {};
  const rateFields = [
    [
      "bounceWarning",
      "Bounce warning (%)",
      defaults.bounceRate.warning,
      overrides.bounceRate?.warning,
    ],
    [
      "bounceSuspend",
      "Bounce suspension (%)",
      defaults.bounceRate.suspend,
      overrides.bounceRate?.suspend,
    ],
    [
      "complaintWarning",
      "Complaint warning (%)",
      defaults.complaintRate.warning,
      overrides.complaintRate?.warning,
    ],
    [
      "complaintSuspend",
      "Complaint suspension (%)",
      defaults.complaintRate.suspend,
      overrides.complaintRate?.suspend,
    ],
    [
      "marketingBounceWarning",
      "Marketing bounce warning (%)",
      defaults.marketingBounceRate.warning,
      overrides.marketingBounceRate?.warning,
    ],
    [
      "marketingBounceSuspend",
      "Marketing bounce pause (%)",
      defaults.marketingBounceRate.suspend,
      overrides.marketingBounceRate?.suspend,
    ],
    [
      "marketingComplaintWarning",
      "Marketing complaint warning (%)",
      defaults.marketingComplaintRate.warning,
      overrides.marketingComplaintRate?.warning,
    ],
    [
      "marketingComplaintSuspend",
      "Marketing complaint pause (%)",
      defaults.marketingComplaintRate.suspend,
      overrides.marketingComplaintRate?.suspend,
    ],
    [
      "screeningFlag",
      "Content screening flag (%)",
      defaults.contentScreening.flagThreshold,
      overrides.contentScreening?.flagThreshold,
    ],
    [
      "screeningBlock",
      "Content screening block (%)",
      defaults.contentScreening.blockThreshold,
      overrides.contentScreening?.blockThreshold,
    ],
    [
      "screeningSample",
      "Content screening sample (%)",
      defaults.contentScreening.sampleRate,
      overrides.contentScreening?.sampleRate,
    ],
    [
      "hookWarning",
      "Hooks failure warning (%)",
      defaults.hookFailureRate.warning,
      overrides.hookFailureRate?.warning,
    ],
    [
      "hookSuspend",
      "Hooks failure suspension (%, empty: never)",
      defaults.hookFailureRate.suspend,
      overrides.hookFailureRate?.suspend,
    ],
    [
      "smsOptOutWarning",
      "SMS opt-out warning (%)",
      defaults.smsOptOutRate.warning,
      overrides.smsOptOutRate?.warning,
    ],
    [
      "smsOptOutSuspend",
      "SMS opt-out suspension (%)",
      defaults.smsOptOutRate.suspend,
      overrides.smsOptOutRate?.suspend,
    ],
    [
      "smsFilteredWarning",
      "SMS carrier filtering warning (%)",
      defaults.smsFilteredRate.warning,
      overrides.smsFilteredRate?.warning,
    ],
    [
      "smsFilteredSuspend",
      "SMS carrier filtering suspension (%)",
      defaults.smsFilteredRate.suspend,
      overrides.smsFilteredRate?.suspend,
    ],
  ] as const;
  const countFields = [
    ["windowDays", "Window (days)", defaults.windowDays, overrides.windowDays],
    [
      "bounceMinimum",
      "Bounce minimum recipients",
      defaults.bounceRate.minimumRecipients,
      overrides.bounceRate?.minimumRecipients,
    ],
    [
      "complaintMinimum",
      "Complaint minimum recipients",
      defaults.complaintRate.minimumRecipients,
      overrides.complaintRate?.minimumRecipients,
    ],
    [
      "marketingBounceMinimum",
      "Marketing bounce minimum recipients",
      defaults.marketingBounceRate.minimumRecipients,
      overrides.marketingBounceRate?.minimumRecipients,
    ],
    [
      "marketingComplaintMinimum",
      "Marketing complaint minimum recipients",
      defaults.marketingComplaintRate.minimumRecipients,
      overrides.marketingComplaintRate?.minimumRecipients,
    ],
    [
      "screeningFirst",
      "Always screen the first (messages)",
      defaults.contentScreening.alwaysFirst,
      overrides.contentScreening?.alwaysFirst,
    ],
    [
      "hookMinimum",
      "Hooks minimum deliveries",
      defaults.hookFailureRate.minimumDeliveries,
      overrides.hookFailureRate?.minimumDeliveries,
    ],
    [
      "smsOptOutMinimum",
      "SMS opt-out minimum messages",
      defaults.smsOptOutRate.minimumRecipients,
      overrides.smsOptOutRate?.minimumRecipients,
    ],
    [
      "smsFilteredMinimum",
      "SMS carrier filtering minimum messages",
      defaults.smsFilteredRate.minimumRecipients,
      overrides.smsFilteredRate?.minimumRecipients,
    ],
  ] as const;

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Policy</PanelTitle>
        <PanelDescription>
          Overrides for this organization only. Leave a field empty to use the default (shown in
          grey). Saving re-evaluates the organization on the worker's next run.
        </PanelDescription>
      </PanelHeader>
      <PanelBody>
        <form action={formAction} className="flex flex-col gap-4">
          <input name="organizationId" type="hidden" value={props.organizationId} />
          <div className="grid gap-4 sm:grid-cols-2">
            {rateFields.map(([name, label, fallback, value]) => (
              <Field key={name}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  defaultValue={value === undefined || value === null ? "" : percent(value)}
                  inputMode="decimal"
                  name={name}
                  placeholder={fallback === null ? "never" : percent(fallback)}
                />
              </Field>
            ))}
            {countFields.map(([name, label, fallback, value]) => (
              <Field key={name}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  defaultValue={value === undefined ? "" : String(value)}
                  inputMode="numeric"
                  name={name}
                  placeholder={String(fallback)}
                />
              </Field>
            ))}
          </div>
          <Label>
            <Checkbox
              defaultChecked={overrides.countSimulatorRecipients ?? false}
              name="countSimulatorRecipients"
            />
            Count mailbox-simulator recipients (testing only)
          </Label>
          <Label>
            <Checkbox
              defaultChecked={overrides.contentScreening?.enforce === false}
              name="screeningShadow"
            />
            Content screening in shadow mode (record verdicts, never block, warn or suspend)
          </Label>
          <Label>
            <Checkbox
              defaultChecked={overrides.contentScreening?.enabled === false}
              name="screeningDisabled"
            />
            Disable content screening (e.g. phishing-simulation senders)
          </Label>
          <Field>
            <FieldLabel>Note</FieldLabel>
            <Input maxLength={2000} name="note" placeholder="Optional" />
          </Field>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <div className="flex gap-2">
            <Button
              disabled={pending && intent !== "save"}
              loading={pending && intent === "save"}
              name="intent"
              onClick={() => choose("save")}
              type="submit"
              value="save"
            >
              Save policy
            </Button>
            <Button
              disabled={pending && intent !== "reset"}
              loading={pending && intent === "reset"}
              name="intent"
              onClick={() => choose("reset")}
              type="submit"
              value="reset"
              variant="ghost"
            >
              Reset to defaults
            </Button>
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
