"use client";

import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@coss/ui/components/popover";
import { ListFilterIcon, XIcon } from "lucide-react";
import Link from "next/link";
import {
  EMAIL_DETAIL_FILTERS,
  EMAIL_STATUS_FILTERS,
  type EmailFilterParams,
  emailFilterQuery,
} from "@/lib/email-filters";
import { listHref } from "./admin/list-controls";
import { FilterLinks } from "./filter-links";
import { SearchForm } from "./search-form";

type DetailFilter = (typeof EMAIL_DETAIL_FILTERS)[number];

const LABELS: Record<Exclude<DetailFilter, "since" | "until">, string> = {
  recipient: "Recipient",
  tag: "Tag",
  category: "Category",
  domain: "Sender domain",
};

type Chip = { label: string; drop: (keyof EmailFilterParams)[] };

/**
 * The removable chips of the active filters besides the search and the status (the created
 * range is one chip, and so is the sub-account a sub-account's page linked to).
 */
function activeChips(params: EmailFilterParams, subaccountLabel?: string): Chip[] {
  const chips: Chip[] = [];
  if (params.subaccount) {
    chips.push({
      label: `Sub-account: ${subaccountLabel ?? params.subaccount}`,
      drop: ["subaccount"],
    });
  }
  for (const key of ["recipient", "tag", "category", "domain"] as const) {
    if (params[key]) chips.push({ label: `${LABELS[key]}: ${params[key]}`, drop: [key] });
  }
  if (params.since || params.until) {
    const label =
      params.since && params.until
        ? params.since === params.until
          ? `Created: ${params.since}`
          : `Created: ${params.since} – ${params.until}`
        : params.since
          ? `Created: since ${params.since}`
          : `Created: until ${params.until}`;
    chips.push({ label, drop: ["since", "until"] });
  }
  return chips;
}

function FilterInput(props: {
  name: DetailFilter;
  label: string;
  value: string;
  placeholder?: string;
  type?: "text" | "email" | "date";
  list?: string;
}) {
  const id = `email-filter-${props.name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        autoComplete="off"
        defaultValue={props.value}
        id={id}
        list={props.list}
        name={props.name}
        placeholder={props.placeholder}
        size="sm"
        type={props.type ?? "text"}
      />
    </div>
  );
}

/**
 * The email list's filters: status links, the search, a popover with the detail filters and a
 * chip per active one. Everything is a GET to `path`, so a filtered list is a shareable URL.
 */
export function EmailFilterBar(props: {
  path: string;
  params: EmailFilterParams;
  /** The organization's domains, suggested for the sender domain. */
  domains: string[];
  /** The filtered sub-account's uid or name, when there is one. */
  subaccountLabel?: string;
}) {
  const { path, params } = props;
  const href = (overrides: Partial<EmailFilterParams>) =>
    listHref(path, emailFilterQuery({ ...params, ...overrides }));
  const chips = activeChips(params, props.subaccountLabel);
  const detailCount = EMAIL_DETAIL_FILTERS.filter((key) => params[key]).length;
  const cleared = Object.fromEntries(EMAIL_DETAIL_FILTERS.map((key) => [key, ""]));
  // The inputs are uncontrolled: a new key remounts them when the URL's filters change (Reset,
  // a removed chip), so Apply never brings back a filter that was just cleared.
  const formKey = listHref("", emailFilterQuery(params));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterLinks
          options={EMAIL_STATUS_FILTERS.map((filter) => ({
            value: filter.value,
            label: filter.label,
            href: href({ status: filter.value }),
          }))}
          value={params.status}
        />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <SearchForm
            action={path}
            className="min-w-0 flex-1"
            keep={emailFilterQuery({ ...params, q: "" })}
            placeholder="Subject or recipient"
            query={params.q}
          />
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <ListFilterIcon />
              Filters
              {detailCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular-nums">
                  {detailCount}
                </span>
              ) : null}
            </PopoverTrigger>
            <PopoverPopup align="end" className="w-80">
              <PopoverTitle className="mb-3 text-sm">Filter emails</PopoverTitle>
              <form
                action={path}
                key={formKey}
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  // Disabled fields aren't submitted: keeps `?tag=&category=…` out of the URL.
                  for (const input of event.currentTarget.querySelectorAll("input")) {
                    if (!input.value) input.disabled = true;
                  }
                }}
              >
                {Object.entries(
                  emailFilterQuery({
                    q: params.q,
                    status: params.status,
                    subaccount: params.subaccount,
                  }),
                ).map(([name, value]) =>
                  value ? <input key={name} name={name} type="hidden" value={value} /> : null,
                )}
                <FilterInput
                  label="Recipient"
                  name="recipient"
                  placeholder="ann@example.com"
                  type="email"
                  value={params.recipient}
                />
                <FilterInput
                  label="Tag"
                  name="tag"
                  placeholder="name or name:value"
                  value={params.tag}
                />
                <FilterInput
                  label="Category"
                  name="category"
                  placeholder="marketing"
                  value={params.category}
                />
                <FilterInput
                  label="Sender domain"
                  list="email-filter-domains"
                  name="domain"
                  placeholder="example.com"
                  value={params.domain}
                />
                <datalist id="email-filter-domains">
                  {props.domains.map((domain) => (
                    <option key={domain} value={domain} />
                  ))}
                </datalist>
                <div className="grid grid-cols-2 gap-2">
                  <FilterInput label="Created from" name="since" type="date" value={params.since} />
                  <FilterInput label="Created to" name="until" type="date" value={params.until} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Recipients include cc and bcc. Sender domains include their subdomains. Days are
                  in UTC.
                </p>
                <div className="flex justify-end gap-2">
                  {detailCount > 0 ? (
                    <Button render={<Link href={href(cleared)} />} size="sm" variant="ghost">
                      Reset
                    </Button>
                  ) : null}
                  <Button size="sm" type="submit">
                    Apply
                  </Button>
                </div>
              </form>
            </PopoverPopup>
          </Popover>
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <Badge
              key={chip.label}
              render={
                <Link
                  aria-label={`Remove filter ${chip.label}`}
                  href={href(Object.fromEntries(chip.drop.map((key) => [key, ""])))}
                />
              }
              size="lg"
              variant="outline"
            >
              <span className="max-w-64 truncate">{chip.label}</span>
              <XIcon />
            </Badge>
          ))}
          {chips.length > 1 ? (
            <Link
              className="px-1 text-muted-foreground text-sm hover:text-foreground"
              href={href({ ...cleared, subaccount: "" })}
            >
              Clear all
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
