import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { cn } from "@coss/ui/lib/utils";
import type { ReactNode } from "react";

/** A small table for a tray: rows of the product's own data, last column to the right. */
export function DataTable({
  head,
  rows,
}: {
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  const edge = (index: number, count: number) =>
    cn(index === 0 && "ps-4", index === count - 1 && "pe-4 text-right");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((label, index) => (
            <TableHead className={edge(index, head.length)} key={label}>
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static table
          <TableRow key={rowIndex}>
            {row.map((cell, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a static table
              <TableCell className={edge(index, row.length)} key={index}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A value set in the code face: ids, addresses, event names. */
export function Mono({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span className={cn("font-mono text-[0.8125rem]", muted && "text-muted-foreground")}>
      {children}
    </span>
  );
}

/** A label and its value on one ruled line. */
export function Line({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className="shrink-0 text-right text-sm">{children}</span>
    </div>
  );
}

/** The stage's heading: what the demo is about, with its state on the right. */
export function StageHead({
  title,
  detail,
  state,
}: {
  title: ReactNode;
  detail?: ReactNode;
  state?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        {detail ? <p className="truncate text-muted-foreground text-sm">{detail}</p> : null}
      </div>
      {state}
    </div>
  );
}
