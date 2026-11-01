"use client";

import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

/**
 * A mono value (a DNS name, a record, an id) with an icon button that copies it: for values
 * people paste elsewhere. `display` shows something other than what is copied.
 */
export function CopyValue(props: { value: string; display?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cn("group/copy inline-flex min-w-0 items-start gap-1", props.className)}>
      <code className="min-w-0 break-all py-1 font-mono text-[0.8125rem] leading-snug">
        {props.display ?? props.value}
      </code>
      <Button
        aria-label="Copy"
        className="shrink-0 text-muted-foreground"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(props.value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            // Clipboard access needs a secure context; the value stays selectable.
          }
        }}
        size="icon-xs"
        variant="ghost"
      >
        {copied ? <CheckIcon className="icon-pop" /> : <CopyIcon />}
      </Button>
    </span>
  );
}
