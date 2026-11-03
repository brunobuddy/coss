import { listSupportTicketsFor } from "@coss/support/admin";
import { Badge } from "@coss/ui/components/badge";
import Link from "next/link";
import { Panel, PanelBody } from "@/components/panel";
import { formatRelative } from "@/lib/format";

/** An organization's or a person's tickets, on their admin page. Nothing shows when there are none. */
export async function SupportTicketsPanel(props: {
  organizationId?: string;
  requesterEmail?: string;
}) {
  const tickets = await listSupportTicketsFor(props);
  if (tickets.length === 0) return null;
  const now = new Date();
  return (
    <Panel title="Support tickets">
      <PanelBody className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <Link
            className="flex items-center gap-2 text-sm hover:underline"
            href={`/admin/support/${ticket.id}`}
            key={ticket.id}
          >
            <span className="font-mono text-muted-foreground text-xs">#{ticket.number}</span>
            <span className="min-w-0 flex-1 truncate">{ticket.subject}</span>
            <Badge size="sm" variant="outline">
              {ticket.status}
            </Badge>
            <span className="font-mono text-muted-foreground text-xs">
              {formatRelative(ticket.lastMessageAt, now)}
            </span>
          </Link>
        ))}
      </PanelBody>
    </Panel>
  );
}
