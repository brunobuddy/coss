import { CheckIcon, SearchIcon } from "lucide-react";
import { StatusDot, type Tone } from "@/components/marketing/demo";
import { FeatureCell, ProductTile, Tray } from "@/components/marketing/kit";

const REVIEW = ["Security review", "DPA signed", "Procurement approved"];

function VendorReview() {
  return (
    <Tray className="min-h-52" title="Vendor review: coss.com">
      <ul className="flex flex-col gap-3 text-sm">
        {REVIEW.map((item) => (
          <li className="flex items-center gap-2" key={item}>
            <CheckIcon aria-hidden className="size-3.5 shrink-0 text-success-foreground" />
            {item}
          </li>
        ))}
      </ul>
    </Tray>
  );
}

const COVERED = ["email", "sms", "scheduling", "risk", "verify", "sign", "inboxes", "hooks"];

function Subprocessors() {
  return (
    <Tray className="min-h-52" title="Your subprocessors">
      <div className="flex flex-col gap-3">
        <p className="font-medium text-sm">coss.com</p>
        <ul aria-label="Products it covers" className="flex flex-wrap gap-1.5">
          {COVERED.map((slug) => (
            <li key={slug}>
              <ProductTile size="sm" slug={slug} />
            </li>
          ))}
        </ul>
      </div>
    </Tray>
  );
}

const USAGE = [
  ["Email", "120,000 recipients"],
  ["SMS", "8,400 segments"],
  ["Scheduling", "1,200 bookings"],
] as const;

function Invoice() {
  return (
    <Tray className="min-h-52" title="October invoice">
      <dl className="flex flex-col gap-3 text-sm">
        {USAGE.map(([product, amount]) => (
          <div className="flex items-baseline justify-between gap-3" key={product}>
            <dt>{product}</dt>
            <dd className="font-mono text-muted-foreground text-xs tabular-nums">{amount}</dd>
          </div>
        ))}
      </dl>
    </Tray>
  );
}

const TRAIL: readonly { name: string; tone: Tone }[] = [
  { name: "email.delivered", tone: "success" },
  { name: "sms.delivered", tone: "success" },
  { name: "scheduling.booking.confirmed", tone: "info" },
];

function OneLog() {
  return (
    <Tray className="min-h-52" title="Logs">
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
          <SearchIcon aria-hidden className="size-3.5 shrink-0" />
          john@example.com
        </p>
        <ul className="flex flex-col gap-2">
          {TRAIL.map((event) => (
            <li key={event.name}>
              <StatusDot
                className="whitespace-normal font-mono text-xs [overflow-wrap:anywhere]"
                tone={event.tone}
              >
                {event.name}
              </StatusDot>
            </li>
          ))}
        </ul>
      </div>
    </Tray>
  );
}

/** One of each thing four vendors would give you four of, shown rather than listed. */
export function OneOfEach() {
  return (
    <div className="grid gap-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
      <FeatureCell
        body="One security review and one contract, whichever products you use."
        title="One vendor onboarding"
      >
        <VendorReview />
      </FeatureCell>
      <FeatureCell body="One name on your list covers every product." title="One subprocessor">
        <Subprocessors />
      </FeatureCell>
      <FeatureCell body="All your usage, on one invoice." title="One bill">
        <Invoice />
      </FeatureCell>
      <FeatureCell
        body="Every message and event, searched in one place."
        title="One diagnostic surface"
      >
        <OneLog />
      </FeatureCell>
    </div>
  );
}
