import Link from "next/link";
import type { ReactNode } from "react";

/** "Contact support", as a way to do it: opens a ticket with the topic already chosen. */
export function SupportLink(props: {
  orgSlug: string;
  topic?: string;
  subject?: string;
  from?: string;
  children?: ReactNode;
}) {
  const params = new URLSearchParams();
  if (props.topic) params.set("topic", props.topic);
  if (props.subject) params.set("subject", props.subject);
  if (props.from) params.set("from", props.from);
  const query = params.toString();
  return (
    <Link
      className="underline underline-offset-2"
      href={`/${props.orgSlug}/support/new${query ? `?${query}` : ""}`}
    >
      {props.children ?? "Contact support"}
    </Link>
  );
}
