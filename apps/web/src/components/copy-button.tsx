"use client";

import { Button } from "@coss/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          // Clipboard access needs a secure context and permission; the value stays selectable.
          setStatus("failed");
        }
        setTimeout(() => setStatus("idle"), 2000);
      }}
      size="sm"
      variant="outline"
    >
      {status === "copied" ? <CheckIcon className="icon-pop" /> : <CopyIcon />}
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : label}
    </Button>
  );
}
