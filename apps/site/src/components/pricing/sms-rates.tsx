"use client";
import { Input } from "@coss/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { useId, useState } from "react";
import type { SmsRate } from "@/lib/pricing";

/** SMS list prices per segment by country, searchable by name or ISO code. */
export function SmsRateTable({ rates }: { rates: SmsRate[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? rates.filter(
        (rate) => rate.country.toLowerCase().includes(needle) || rate.code.toLowerCase() === needle,
      )
    : rates;

  return (
    <div className="flex flex-col">
      <div className="border-b p-3">
        <label className="sr-only" htmlFor={searchId}>
          Search countries
        </label>
        <Input
          className="max-w-xs"
          id={searchId}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search countries"
          type="search"
          value={query}
        />
      </div>
      <div className="max-h-112 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4">Country</TableHead>
              <TableHead className="text-right">Sent, per segment</TableHead>
              <TableHead className="pe-4 text-right">Received, per segment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((rate) => (
              <TableRow key={rate.code}>
                <TableCell className="ps-4">{rate.country}</TableCell>
                <TableCell className="text-right tabular-nums">{rate.outbound}</TableCell>
                <TableCell className="pe-4 text-right text-muted-foreground tabular-nums">
                  {rate.inbound ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell className="ps-4 text-muted-foreground" colSpan={3}>
                  No country matches “{query}”. SMS can only be sent where it is priced.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
