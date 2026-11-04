import { Badge } from "@coss/ui/components/badge";
import { StatusDot, type Tone } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";

const STEP = 420;
const at = (index: number) => ({ animationDelay: `${index * STEP}ms` });

const EVENTS: { type: string; at: string; tone: Tone }[] = [
  { type: "email.sent", at: "09:41:08", tone: "info" },
  { type: "email.delivered", at: "09:41:12", tone: "success" },
  { type: "email.opened", at: "09:43:27", tone: "success" },
];

/** One email's page in the dashboard, reduced to its subject and events. */
export function DashboardView() {
  return (
    <Tray className="h-full" title="In the dashboard">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">Welcome to Acme, John</span>
            <span className="truncate text-muted-foreground text-sm">To john@example.com</span>
          </div>
          <span className="enter-pop" style={at(2)}>
            <Badge variant="success">delivered</Badge>
          </span>
        </div>
        <ol className="flex flex-col divide-y">
          {EVENTS.map((event, index) => (
            <li
              className="enter-rise flex items-baseline justify-between gap-3 py-2.5"
              key={event.type}
              style={at(index + 1)}
            >
              <StatusDot className="font-mono text-[0.8125rem]" tone={event.tone}>
                {event.type}
              </StatusDot>
              <time className="font-mono text-muted-foreground text-xs tabular-nums">
                {event.at}
              </time>
            </li>
          ))}
        </ol>
      </div>
    </Tray>
  );
}

/** A coding agent answering a support question through the MCP server. */
export function AgentView() {
  return (
    <Tray className="h-full" flush title="Ask your agent, over MCP">
      <div className="flex h-full flex-col gap-3 bg-[#282a30] p-4 font-mono text-[#e6e6e6] text-[0.8125rem] leading-relaxed sm:p-5">
        <p className="enter-rise -mx-2 flex gap-2 bg-white/8 px-2 py-1" style={at(0)}>
          <span aria-hidden className="text-[#8b8c91]">
            ❯
          </span>
          Did john@example.com get the onboarding email?
        </p>
        <p className="enter-rise flex gap-2" style={at(1)}>
          <span aria-hidden className="text-[#4eba65]">
            ●
          </span>
          diagnose_email(john@example.com)
        </p>
        <p
          className="enter-rise flex gap-2 rounded-md bg-[#4eba65]/16 px-2 py-1.5 text-white"
          style={at(3)}
        >
          <span aria-hidden className="text-white">
            ●
          </span>
          Yes, delivered at 09:41 and opened two minutes later.
        </p>
      </div>
    </Tray>
  );
}

/** The same answer from the SDK, for a support view in the customer's own app. */
export function ApiView() {
  return (
    <Tray className="h-full" flush title="In your app, with the SDK">
      <div className="flex h-full flex-col gap-3 p-4 font-mono text-xs leading-relaxed sm:p-5 sm:text-[0.8125rem]">
        <code className="enter-rise whitespace-nowrap" style={at(0)}>
          const {"{ data }"} = await diagnose(coss, id);
        </code>
        <code className="enter-rise text-muted-foreground" style={at(2)}>
          data.summary
        </code>
        <p
          className="enter-rise rounded-md bg-success/12 px-2 py-1.5 text-success-foreground"
          style={at(3)}
        >
          "Delivered to john@example.com."
        </p>
      </div>
    </Tray>
  );
}
