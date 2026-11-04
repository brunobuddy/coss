import { Card } from "@coss/ui/components/card";
import { cn } from "@coss/ui/lib/utils";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { Tray } from "@/components/marketing/kit";
import { planPriceText } from "@/lib/billing-text";
import type { PagePricing } from "@/lib/page-pricing";
import type { RateTable } from "@/lib/pricing";

/** The cells of a page's prices, so a row of them always fills the tray. */
const COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
};

/** A page's prices, one tray: a cell per meter, then what the Free plan includes. */
export function PricePanel({ pricing }: { pricing: PagePricing }) {
  const { tables, included } = pricing;
  const cells = tables.length + (included.length ? 1 : 0);
  return (
    <Tray
      action={
        <Link className="group flex items-center gap-1 font-medium text-sm" href="/pricing">
          See all plans
          <ArrowRightIcon
            aria-hidden
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      }
      flush
      title="Pricing"
    >
      <div className={cn("grid gap-px bg-border/64", COLUMNS[cells])}>
        {tables.map((table) => (
          <div className="bg-card p-5 sm:p-6" key={table.meter}>
            <RateCell table={table} />
          </div>
        ))}
        {included.length ? (
          <div className="flex flex-col gap-4 bg-card p-5 sm:p-6">
            <h3 className="font-medium text-sm">The Free plan includes</h3>
            <ul className="flex flex-col gap-2.5">
              {included.map((line) => (
                <li className="flex items-start gap-2 text-sm" key={line}>
                  <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-auto text-muted-foreground text-xs leading-snug">
              Paid plans start at {planPriceText("pro")}, credited against usage.
            </p>
          </div>
        ) : null}
      </div>
    </Tray>
  );
}

/** Every usage rate, for the pricing page: the same cells, packed in columns. */
export function RateCellCards({ tables }: { tables: readonly RateTable[] }) {
  return (
    <div className="gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
      {tables.map((table) => (
        <Card className="p-5" key={`${table.meter}:${table.scope ?? ""}`}>
          <RateCell onPricingPage table={table} />
        </Card>
      ))}
    </div>
  );
}

/**
 * One meter's price. A flat or graduated rate leads with its price, big, so the number is what you
 * read first; later bands follow as rows. Prices per value (number types, fees) are only rows.
 */
function RateCell({ table, onPricingPage }: { table: RateTable; onPricingPage?: boolean }) {
  const { kind, bands } = table;
  const [first] = bands;
  const led = kind !== "value" && first;
  const per = table.scope ? `${table.scope}, ${table.per}` : table.per;
  const rows = led ? bands.slice(1) : bands;
  return (
    <div className="flex h-full flex-col gap-4">
      <h3 className="font-medium text-sm">{table.product}</h3>
      {led ? (
        <p className="flex flex-col gap-1">
          <span className="font-heading font-semibold text-4xl tabular-nums tracking-[-0.01em]">
            {first.price}
          </span>
          <span className="text-muted-foreground text-sm">
            {kind === "graduated" ? `${per}, ${first.range.toLowerCase()}` : per}
          </span>
        </p>
      ) : (
        <p className="-mb-2 text-muted-foreground text-sm">{per}</p>
      )}
      {rows.length ? (
        <dl className="flex flex-col">
          {rows.map((band) => (
            <div
              className="flex items-baseline justify-between gap-4 border-border/64 border-t py-2 text-sm last:pb-0"
              key={band.range}
            >
              <dt className="text-muted-foreground">{band.range}</dt>
              <dd className="whitespace-nowrap font-medium tabular-nums">{band.price}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {table.scope && !onPricingPage ? (
        <p className="mt-auto text-muted-foreground text-xs leading-snug">
          Other countries on the{" "}
          <Link className="text-foreground underline underline-offset-2" href="/pricing#sms">
            pricing page
          </Link>
        </p>
      ) : table.note ? (
        <p className="mt-auto text-muted-foreground text-xs leading-snug">{table.note}</p>
      ) : null}
    </div>
  );
}
