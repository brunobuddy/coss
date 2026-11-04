import { cn } from "@coss/ui/lib/utils";
import { AGENT_PROMPT } from "@/lib/site";

const STEP = 420;
const at = (index: number) => ({ animationDelay: `${index * STEP}ms` });

const LINES: readonly { kind: "tool" | "result" | "done"; text: string }[] = [
  { kind: "tool", text: "Fetch(https://coss.com/llms.txt)" },
  { kind: "tool", text: "Bash(npx coss-cli init --agents)" },
  { kind: "result", text: "✔ Saved a development key to .env.local as COSS_API_KEY." },
  { kind: "tool", text: "Fetch(https://coss.com/docs/email/sending.md)" },
  { kind: "tool", text: "Write(src/lib/coss.ts)" },
  { kind: "tool", text: "Write(src/app/api/webhooks/coss/route.ts)" },
  { kind: "tool", text: "Bash(npx tsx scripts/send-test.ts)" },
  { kind: "result", text: "email_01k7c8m4q2f3e9v6t5r1n0p8yz  queued" },
  {
    kind: "done",
    text: "Email and signed delivery webhooks are in. The test send was recorded with your sandbox key; nothing was delivered.",
  },
];

/** A Claude Code session in its own layout, one line at a time. Always dark: it's a terminal. */
export function AgentSession() {
  return (
    <div className="overflow-hidden rounded-2xl bg-[#282a30] font-mono text-[#e6e6e6] text-[0.8125rem] leading-relaxed shadow-[0_32px_64px_-32px] shadow-black/40">
      <div className="flex items-center gap-4 px-4 py-3">
        <span aria-hidden className="flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 truncate font-sans font-medium text-[#a8a9ad] text-sm">
          Add coss.com to this project
        </span>
      </div>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-3">
        <p className="flex flex-col">
          <span className="font-semibold text-white">Claude Code</span>
          <span className="text-[#8b8c91]">~/acme</span>
        </p>
        <p className="enter-rise -mx-4 flex gap-2.5 bg-white/8 px-4 py-1" style={at(0)}>
          <span aria-hidden className="text-[#8b8c91]">
            ❯
          </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{AGENT_PROMPT}</span>
        </p>
        <ol className="flex flex-col gap-1">
          {LINES.map((line, index) => (
            <li
              className={cn(
                "enter-rise flex items-start gap-2.5 [overflow-wrap:anywhere]",
                line.kind === "result" && "ps-[1.375rem] text-[#8b8c91]",
                line.kind === "done" && "mt-3",
                line.kind === "tool" && index > 0 && "mt-1",
              )}
              key={line.text}
              style={at(index + 1)}
            >
              <span
                aria-hidden
                className={cn(
                  "shrink-0",
                  line.kind === "tool" && "text-[#4eba65]",
                  line.kind === "result" && "text-[#8b8c91]",
                  line.kind === "done" && "text-white",
                )}
              >
                {line.kind === "result" ? "⎿" : "●"}
              </span>
              <span className="min-w-0">{line.text}</span>
            </li>
          ))}
        </ol>
        <p className="enter-rise flex gap-2.5 text-[#8b8c91]" style={at(LINES.length + 1)}>
          <span aria-hidden>✻</span>
          Worked for 2m 14s
        </p>
      </div>
      <div className="mx-4 flex items-center gap-2.5 border-white/24 border-y py-1.5">
        <span aria-hidden className="text-white">
          ❯
        </span>
        <span aria-hidden className="h-4 w-2 bg-white/72 motion-safe:animate-pulse" />
      </div>
      <p className="px-4 py-2.5 text-[#8b8c91] text-xs">
        <span className="text-[#b1b9f9]">⏵⏵ accept edits on</span> (shift+tab to cycle)
      </p>
    </div>
  );
}
