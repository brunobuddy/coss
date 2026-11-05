import { PLAN_KEYS, PLANS, type PlanKey } from "@coss/billing/catalog";
import { Button } from "@coss/ui/components/button";
import { Frame, FramePanel } from "@coss/ui/components/frame";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import { formatPrice, planSignUpPath } from "@/lib/pricing";
import { dashboardUrl, SALES_EMAIL } from "@/lib/site";

const TAGLINES: Record<PlanKey, string> = {
  free: "For trying coss.com and side projects.",
  pro: "For production apps.",
  scale: "For growing teams.",
  enterprise: "For high volume, compliance and custom terms.",
};

const PRICE_NOTES: Record<PlanKey, string> = {
  free: "No card required",
  pro: "All of it is credit for usage",
  scale: "All of it is credit for usage",
  enterprise: "Annual commitment",
};

function PlanCta({ plan }: { plan: PlanKey }) {
  if (plan === "enterprise") {
    return (
      <Button
        className="w-full"
        render={<a href={`mailto:${SALES_EMAIL}`} />}
        size="lg"
        variant="outline"
      >
        Contact sales
      </Button>
    );
  }
  // Signed-in visitors are sent on to the dashboard by the sign-up page.
  return (
    <Button
      className="w-full"
      render={<a href={dashboardUrl(planSignUpPath(plan))} />}
      size="lg"
      variant={plan === "pro" ? "default" : "outline"}
    >
      {plan === "free" ? "Start for free" : "Get started"}
    </Button>
  );
}

/** The four plans on one tray (from `@coss/billing/catalog`, which billing enforces). */
export function PlanCards() {
  return (
    <Frame>
      {/* Each card spans four rows of a shared grid (subgrid), so prices, buttons and lists line up. */}
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_KEYS.map((key) => {
          const plan = PLANS[key];
          return (
            <FramePanel
              className={cn(
                "row-span-4 grid grid-rows-subgrid gap-0 p-0 text-left",
                key === "pro" && "z-1 shadow-md ring-1 ring-foreground/16",
              )}
              key={key}
            >
              <div className="flex flex-col gap-1 px-5 pt-5">
                <h2 className="font-heading font-semibold text-xl tracking-[-0.01em]">
                  {plan.name}
                </h2>
                <p className="text-muted-foreground text-sm leading-snug">{TAGLINES[key]}</p>
              </div>
              <div className="flex flex-col gap-1 px-5 pt-5">
                <p className="flex items-baseline gap-1.5">
                  {key === "enterprise" && (
                    <span className="text-muted-foreground text-sm">From</span>
                  )}
                  <span className="font-heading font-semibold text-4xl tabular-nums tracking-[-0.012em]">
                    {formatPrice(plan.feeCents)}
                  </span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </p>
                <p className="text-muted-foreground text-sm">{PRICE_NOTES[key]}</p>
              </div>
              <div className="relative px-5 pt-5">
                <PlanCta plan={key} />
              </div>
              <ul className="flex flex-col gap-2.5 p-5 text-sm leading-snug">
                {plan.highlights.map((highlight) => (
                  <li className="flex gap-2" key={highlight}>
                    <CheckIcon
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    {highlight}
                  </li>
                ))}
              </ul>
            </FramePanel>
          );
        })}
      </div>
    </Frame>
  );
}
