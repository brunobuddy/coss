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
import { useState } from "react";
import { ShowAll } from "@/components/marketing/facts";
import type { CompareRow } from "@/lib/compare";

/** Rows shown before "Show all": every row stays in the page for crawlers and answer engines. */
const FIRST_ROWS = 8;

const SIDE =
  "whitespace-normal leading-snug max-sm:block max-sm:p-0 max-sm:pb-2 max-sm:before:mb-0.5 max-sm:before:block max-sm:before:font-medium max-sm:before:text-muted-foreground max-sm:before:text-xs max-sm:before:content-[attr(data-side)]";

/** The comparison: the first rows, then the rest behind a button. Grayscale, no win or loss marks. */
export function CompareRows({ name, rows }: { name: string; rows: readonly CompareRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Table className="max-sm:block sm:table-fixed">
        <TableHeader className="max-sm:hidden">
          <TableRow>
            <TableHead className="w-1/4 ps-4">
              <span className="sr-only">Feature</span>
            </TableHead>
            <TableHead>coss.com</TableHead>
            <TableHead className="pe-4">{name}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {rows.map((row, index) => (
            <TableRow
              className={cn(
                "max-sm:block max-sm:px-4 max-sm:py-2.5",
                !open && index >= FIRST_ROWS && "hidden max-sm:hidden",
              )}
              key={row.label}
            >
              <TableCell className="whitespace-normal py-3.5 ps-4 align-top font-medium leading-snug max-sm:block max-sm:p-0 max-sm:ps-0! max-sm:pb-1.5 max-sm:text-base">
                {row.label}
                {row.note ? (
                  <span className="mt-1 block font-normal text-muted-foreground text-xs">
                    {row.note}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className={`${SIDE} py-3.5 align-top`} data-side="coss.com">
                {row.coss}
              </TableCell>
              <TableCell
                className={`${SIDE} py-3.5 pe-4 align-top text-muted-foreground max-sm:pe-0!`}
                data-side={name}
              >
                {row.them}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > FIRST_ROWS ? (
        <ShowAll count={rows.length} onToggle={() => setOpen((value) => !value)} open={open} />
      ) : null}
    </>
  );
}
