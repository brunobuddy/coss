"use client";
import { Button } from "@coss/ui/components/button";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AGENT_PROMPT } from "@/lib/site";

function useCopyPrompt() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the prompt stays selectable.
    }
  }

  return { copied, copy };
}

/** The prompt as a button, where the prompt itself is on screen next to it. */
export function CopyPromptButton() {
  const { copied, copy } = useCopyPrompt();
  return (
    <Button aria-live="polite" className="self-start" onClick={copy}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy the prompt"}
    </Button>
  );
}

export function CopyPrompt() {
  const { copied, copy } = useCopyPrompt();
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background py-1.5 ps-4 pe-1.5 shadow-xs/5">
      <p className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [scrollbar-width:none]">
        {AGENT_PROMPT}
      </p>
      <Button aria-live="polite" className="shrink-0" onClick={copy} variant="outline">
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
