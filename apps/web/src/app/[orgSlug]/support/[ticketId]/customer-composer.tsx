"use client";

import { SupportComposer } from "@/components/support/composer";
import { replyToTicketAction } from "../actions";

export function CustomerComposer(props: { orgSlug: string; ticketId: string }) {
  return (
    <SupportComposer
      action={replyToTicketAction}
      draftKey={`support-draft:${props.ticketId}`}
      hidden={{ orgSlug: props.orgSlug, ticketId: props.ticketId }}
      modes={[{ value: "reply", label: "Reply", placeholder: "Write a reply…" }]}
      sendLabel={() => "Send reply"}
      success={() => "Reply sent"}
    />
  );
}
