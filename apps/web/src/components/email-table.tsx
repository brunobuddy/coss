import type { EmailListItem } from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import Link from "next/link";
import { formatDateTime, formatRelative } from "@/lib/format";
import { EmailStatusDot } from "./email-badges";

/** "2 opens · 1 click" for tracked emails, "—" for untracked ones. */
export function engagement({ tracking }: EmailListItem): string {
  const parts = [
    tracking.opens
      ? `${tracking.open_count} ${tracking.open_count === 1 ? "open" : "opens"}`
      : null,
    tracking.clicks
      ? `${tracking.click_count} ${tracking.click_count === 1 ? "click" : "clicks"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** An environment's emails as a table (for a `Panel`): status, recipients, subject, engagement. */
export function EmailTable(props: {
  emails: EmailListItem[];
  /** The environment's base path; rows link to `${base}/email/messages/${id}`. */
  base: string;
  /** Leave out the engagement column (narrow places). */
  compact?: boolean;
}) {
  const now = new Date();
  return (
    <Table variant="card">
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Status</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>To</TableHead>
          {props.compact ? null : <TableHead>Engagement</TableHead>}
          <TableHead className="text-right">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.emails.map((email) => (
          <TableRow key={email.id}>
            <TableCell>
              <div className="flex flex-col items-start gap-0.5">
                <EmailStatusDot status={email.status} />
                {email.status === "scheduled" && email.scheduled_at ? (
                  <span
                    className="font-mono text-muted-foreground text-xs"
                    title={formatDateTime(email.scheduled_at)}
                  >
                    {formatRelative(email.scheduled_at, now)}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="max-w-80 truncate">
              <Link
                className="font-medium underline-offset-4 before:absolute before:inset-0 hover:underline"
                href={`${props.base}/email/messages/${email.id}`}
              >
                {email.content_storage.discarded_at ? (
                  <span className="text-muted-foreground italic">Content not stored</span>
                ) : (
                  email.subject
                )}
              </Link>
            </TableCell>
            <TableCell className="max-w-56 truncate text-muted-foreground">
              {email.to.join(", ")}
            </TableCell>
            {props.compact ? null : (
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {engagement(email)}
              </TableCell>
            )}
            <TableCell
              className="text-right font-mono text-muted-foreground text-xs"
              title={formatDateTime(email.created_at)}
            >
              {formatRelative(email.created_at, now)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
