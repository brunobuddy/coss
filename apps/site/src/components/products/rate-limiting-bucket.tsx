"use client";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { cn } from "@coss/ui/lib/utils";
import { RotateCcwIcon, ZapIcon } from "lucide-react";
import { useState } from "react";

/** The sample's bucket: 5 tokens an hour, so one token comes back every 12 minutes. */
const BURST = 5;
const TOKEN_MS = (3600 / 5) * 1000;

/**
 * A bucket you can drain: each press is one `coss.risk.limit()` check against the sample's bucket,
 * answered as the API would (illustrative: no time passes between presses).
 */
export function BucketDemo() {
  const [taken, setTaken] = useState(1);
  const [denied, setDenied] = useState(false);
  const remaining = BURST - taken;

  function check() {
    if (remaining === 0) setDenied(true);
    else setTaken(taken + 1);
  }

  function reset() {
    setTaken(1);
    setDenied(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">password_reset</p>
          <p className="truncate text-muted-foreground text-sm">5 per hour, per address</p>
        </div>
        <Badge variant={denied ? "error" : "success"}>{denied ? "denied" : "allowed"}</Badge>
      </div>
      <div
        aria-label={`${remaining} of ${BURST} tokens left`}
        className="grid grid-cols-5 gap-1.5"
        role="img"
      >
        {Array.from({ length: BURST }, (_, index) => (
          <span
            className={cn(
              "h-7 rounded-md border transition-colors duration-200",
              index < remaining ? "border-transparent bg-foreground/80" : "bg-muted",
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed cells
            key={index}
          />
        ))}
      </div>
      <pre
        aria-live="polite"
        className="overflow-x-auto rounded-lg bg-muted/64 p-3 font-mono text-[0.8125rem] leading-relaxed tabular-nums"
      >
        {`{
  "allowed": ${!denied},
  "limit": ${BURST},
  "remaining": ${remaining},
  "reset_ms": ${taken * TOKEN_MS},
  "retry_after_ms": ${denied ? TOKEN_MS : "null"},
  "degraded": false
}`}
      </pre>
      {denied ? (
        <Button className="self-start" onClick={reset} size="sm" variant="outline">
          <RotateCcwIcon />
          Start over
        </Button>
      ) : (
        <Button className="self-start" onClick={check} size="sm" variant="outline">
          <ZapIcon />
          Check again
        </Button>
      )}
    </div>
  );
}
