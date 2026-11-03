"use client";

import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { ShieldAlertIcon } from "lucide-react";
import { SupportComposer } from "@/components/support/composer";
import { writeToTicketAction } from "./actions";

const MODES = [
  { value: "reply", label: "Reply", placeholder: "Write to the customer…" },
  {
    value: "note",
    label: "Note",
    placeholder: "Only your team sees notes…",
    hint: "Internal: never emailed, never shown to the customer.",
  },
];

export function RepComposer(props: {
  ticketId: string;
  lastSeenMessageId: string | null;
  to: string;
  unverified: boolean;
  savedReplies: { id: string; title: string; body: string }[];
}) {
  return (
    <SupportComposer
      action={writeToTicketAction}
      draftKey={`support-draft:${props.ticketId}`}
      extraActions={({ pending, mode }) =>
        mode === "reply" ? (
          <>
            <Button
              disabled={pending}
              name="after"
              size="sm"
              type="submit"
              value="snoozed"
              variant="ghost"
            >
              Send & snooze
            </Button>
            <Button
              disabled={pending}
              name="after"
              size="sm"
              type="submit"
              value="resolved"
              variant="outline"
            >
              Send & resolve
            </Button>
          </>
        ) : null
      }
      hidden={{ ticketId: props.ticketId, lastSeenMessageId: props.lastSeenMessageId ?? "" }}
      modes={MODES}
      savedReplies={props.savedReplies}
      sendLabel={(mode) => (mode === "note" ? "Add note" : `Send to ${props.to}`)}
      success={(mode) => (mode === "note" ? "Note added" : "Reply sent")}
      warning={
        props.unverified ? (
          <Alert variant="warning">
            <ShieldAlertIcon />
            <AlertDescription>
              We can't prove who sent this. It could be forged, so don't share account details until
              you've checked.
            </AlertDescription>
          </Alert>
        ) : null
      }
    />
  );
}
