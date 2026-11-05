import type { SmsRegistrationRow } from "@coss/sms";
import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import { Panel, PanelAction, PanelBody, PanelDescription, PanelHeader } from "@/components/panel";
import { StatusDot, type StatusTone } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { registerAgainHref } from "@/lib/sms-registration";

type Step = { label: string; detail: string; tone: StatusTone; pulse?: boolean };

/**
 * Shown on the SMS page right after a registration is submitted (`?registered=<id>`): what was
 * sent for review, where it is now and what happens next, until dismissed.
 */
export function RegistrationSubmittedPanel(props: {
  envBase: string;
  registration: SmsRegistrationRow;
  /** The numbers it covers: the toll-free number it verifies, or the local numbers under 10DLC. */
  numbers: string[];
}) {
  const { registration } = props;
  const local = registration.kind === "us_10dlc";
  const approved = registration.status === "approved";
  const refused = registration.status === "rejected" || registration.status === "failed";
  const what = local ? "US A2P 10DLC registration" : "toll-free verification";
  const covers =
    props.numbers.length === 0
      ? local
        ? "Every local number you buy"
        : "The toll-free number"
      : props.numbers.length === 1
        ? props.numbers[0]
        : `${props.numbers.length} local numbers`;

  const steps: Step[] = [
    {
      label: "Submitted",
      detail: registration.submittedAt
        ? formatDateTime(registration.submittedAt.toISOString())
        : "Just now",
      tone: "success",
    },
    {
      label: "Carrier review",
      detail: approved ? "Approved" : refused ? "Not approved" : "Usually takes a few days",
      tone: approved ? "success" : refused ? "error" : "info",
      pulse: !approved && !refused,
    },
    {
      label: approved ? "Sending" : "Start sending",
      detail: `${covers} ${approved ? "can send" : "can send once approved"}`,
      tone: approved ? "success" : "neutral",
    },
  ];

  const Icon = refused ? CircleXIcon : CircleCheckIcon;
  return (
    <Panel>
      <PanelHeader>
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden
            className={cn("mt-0.5 size-5 shrink-0", refused ? "text-destructive" : "text-success")}
            strokeWidth={1.75}
          />
          <div className="flex flex-col gap-1">
            <h2 className="font-heading font-semibold text-base tracking-[-0.01em]">
              {refused
                ? `${registration.profile.legalName}'s ${what} wasn't approved`
                : approved
                  ? `${registration.profile.legalName}'s ${what} is approved`
                  : `${registration.profile.legalName}'s ${what} is submitted`}
            </h2>
            <PanelDescription>
              {refused
                ? (registration.rejectionReason ??
                  "Carriers turned it down. Check the details and register again.")
                : approved
                  ? "Live messages can go from the numbers it covers."
                  : "coss.com sent your details to the carriers and follows their review. There's nothing else for you to do: owners and admins get an email when the carriers decide, and sending starts by itself once it's approved."}
            </PanelDescription>
          </div>
        </div>
        <PanelAction>
          {refused ? (
            <Button
              render={<Link href={`${props.envBase}${registerAgainHref(registration)}`} />}
              size="sm"
            >
              Register again
            </Button>
          ) : null}
          <Button
            render={<Link href={`${props.envBase}/sms/numbers`} />}
            size="sm"
            variant="outline"
          >
            Done
          </Button>
        </PanelAction>
      </PanelHeader>
      <PanelBody>
        <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              className={cn("flex flex-col gap-1 bg-card px-4 py-3", step.pulse && "bg-accent/40")}
              key={step.label}
            >
              <StatusDot pulse={step.pulse} tone={step.tone}>
                <span
                  className={cn(
                    "font-medium text-sm",
                    step.tone === "neutral" && "text-muted-foreground",
                  )}
                >
                  {index + 1}. {step.label}
                </span>
              </StatusDot>
              <span className="text-muted-foreground text-xs">{step.detail}</span>
            </li>
          ))}
        </ol>
        {local && !refused ? (
          <p className="mt-3 text-muted-foreground text-xs">
            Local numbers you buy later join this registration: they don't need one of their own.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
