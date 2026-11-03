import { PLAN_KEYS, PLANS } from "@coss/billing/catalog";
import { supportStatsByPlan } from "@coss/support/admin";
import { Panel, PanelBody } from "@/components/panel";

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

const DAY = 24 * 60 * 60 * 1000;

/** How the last 30 days went, plan by plan. */
export async function StatsStrip() {
  const stats = await supportStatsByPlan(new Date(Date.now() - 30 * DAY));
  return (
    <Panel description="Median first response and targets missed, last 30 days." title="By plan">
      <PanelBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {PLAN_KEYS.map((plan) => {
          const row = stats.find((item) => item.plan === plan);
          return (
            <div className="flex flex-col gap-0.5" key={plan}>
              <span className="text-muted-foreground text-xs">{PLANS[plan].name}</span>
              <span className="font-mono text-lg">
                {formatMinutes(row?.medianFirstResponseMinutes ?? null)}
              </span>
              <span className="text-muted-foreground text-xs">{row?.breached ?? 0} missed</span>
            </div>
          );
        })}
      </PanelBody>
    </Panel>
  );
}
