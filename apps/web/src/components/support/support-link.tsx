import { supportHref } from "@coss/dashboard-routes";
import Link from "next/link";
import type { ReactNode } from "react";

/** A new ticket about the page it's opened from, optionally about one item on it. */
export function newTicketHref(input: {
  orgSlug: string;
  from?: string | undefined;
  reference?: string | undefined;
  topic?: string | undefined;
  subject?: string | undefined;
}): string {
  const { orgSlug, ...query } = input;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  return supportHref(orgSlug, `/new${search ? `?${search}` : ""}`);
}

/** "Contact support", as a way to do it: opens a ticket with the topic already chosen. */
export function SupportLink(props: {
  orgSlug: string;
  topic?: string;
  subject?: string;
  from?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      className="underline underline-offset-2"
      href={newTicketHref({
        orgSlug: props.orgSlug,
        topic: props.topic,
        subject: props.subject,
        from: props.from,
      })}
    >
      {props.children ?? "Contact support"}
    </Link>
  );
}
