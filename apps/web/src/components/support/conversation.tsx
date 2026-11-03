import { Badge } from "@coss/ui/components/badge";
import { cn } from "@coss/ui/lib/utils";
import { LockIcon, PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatBytes, formatDateTime } from "@/lib/format";
import { SupportText } from "./support-text";

export type ConversationAttachment = {
  id: string;
  filename: string;
  size: number;
  href: string | null;
};

export type ConversationItem = {
  id: string;
  kind: "customer" | "agent" | "note" | "event";
  author: string;
  subtitle?: string | null;
  at: Date;
  body: string;
  visibleText: string;
  /** For events: the line shown in the timeline. */
  eventLabel?: string | null;
  meta?: ReactNode;
  attachments: ConversationAttachment[];
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? "?"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function Message(props: { item: ConversationItem }) {
  const { item } = props;
  const note = item.kind === "note";
  const hasMore = item.body.trim() !== item.visibleText.trim() && item.body.trim() !== "";
  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        item.kind === "agent" && "bg-muted/40",
        note && "border-dashed bg-transparent",
      )}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border font-medium text-[0.6875rem]",
            item.kind === "agent" ? "bg-foreground text-background" : "bg-muted",
          )}
        >
          {note ? <LockIcon className="size-3" /> : initials(item.author)}
        </span>
        <span className="min-w-0 truncate font-medium text-sm">{item.author}</span>
        {note ? <Badge variant="outline">Internal note</Badge> : null}
        {item.subtitle ? (
          <span className="min-w-0 truncate text-muted-foreground text-xs">{item.subtitle}</span>
        ) : null}
        <span className="ms-auto flex items-center gap-2">
          {item.meta}
          <time className="font-mono text-muted-foreground text-xs">{formatDateTime(item.at)}</time>
        </span>
      </header>
      <SupportText text={item.visibleText || item.body || "(No text)"} />
      {hasMore ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground text-xs">
            Show the whole message
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[0.8125rem] text-muted-foreground leading-relaxed">
            {item.body}
          </pre>
        </details>
      ) : null}
      {item.attachments.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3">
          {item.attachments.map((attachment) => (
            <li className="flex items-center gap-2 text-sm" key={attachment.id}>
              <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
              {attachment.href ? (
                <a
                  className="min-w-0 truncate underline underline-offset-2"
                  download
                  href={attachment.href}
                >
                  {attachment.filename}
                </a>
              ) : (
                <span className="min-w-0 truncate text-muted-foreground">
                  {attachment.filename} (not available)
                </span>
              )}
              <span className="font-mono text-muted-foreground text-xs">
                {formatBytes(attachment.size)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** A ticket's timeline, in the same shape for customers and reps. */
export function Conversation(props: { items: ConversationItem[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {props.items.map((item) =>
        item.kind === "event" ? (
          <li className="flex items-center gap-3 px-1 text-muted-foreground text-xs" key={item.id}>
            <span aria-hidden className="h-px flex-1 bg-border" />
            <span className="text-center">{item.eventLabel}</span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </li>
        ) : (
          <li key={item.id}>
            <Message item={item} />
          </li>
        ),
      )}
    </ol>
  );
}
