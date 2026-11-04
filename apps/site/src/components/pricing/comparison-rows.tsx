"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import { useState } from "react";
import { ShowAll } from "@/components/marketing/facts";

/** How many rows show before "Show all": enough to compare the plans at a glance. */
const FIRST_ROWS = 8;

function Value({ value }: { value: string }) {
  if (value === "Yes") {
    return (
      <>
        <CheckIcon aria-hidden className="size-4" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === "—") {
    return (
      <>
        <MinusIcon aria-hidden className="size-4 text-muted-foreground/64" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return value;
}

/**
 * The comparison's table, with the longer rows behind a button. Every row stays in the page (for
 * crawlers and ⌘F once opened); narrow screens scroll sideways with the row labels pinned.
 */
export function ComparisonRows({
  plans,
  rows,
}: {
  plans: readonly { key: string; name: string }[];
  rows: readonly { label: string; values: readonly string[] }[];
}) {
  const [open, setOpen] = useState(false);
  const hidden = rows.length - FIRST_ROWS;
  return (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[44rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 w-1/4 bg-card ps-4">
                <span className="sr-only">Plan</span>
              </TableHead>
              {plans.map((plan) => (
                <TableHead className="text-foreground" key={plan.key}>
                  {plan.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow className={cn(!open && index >= FIRST_ROWS && "hidden")} key={row.label}>
                <th
                  className="sticky left-0 z-10 whitespace-normal bg-card py-3 ps-4 pe-3 text-left font-normal text-muted-foreground text-sm leading-snug"
                  scope="row"
                >
                  {row.label}
                </th>
                {row.values.map((value, column) => (
                  <TableCell
                    className="whitespace-normal py-3 leading-snug"
                    key={plans[column]?.key}
                  >
                    <Value value={value} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hidden > 0 ? (
        <ShowAll count={rows.length} onToggle={() => setOpen((value) => !value)} open={open} />
      ) : null}
    </>
  );
}
