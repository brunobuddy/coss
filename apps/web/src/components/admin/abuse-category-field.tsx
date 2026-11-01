"use client";

import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useState } from "react";
import {
  ABUSE_CATEGORIES,
  ABUSE_CATEGORY_KEYS,
  type AbuseCategory,
  isAbuseCategory,
} from "@/lib/abuse-categories";

const ITEMS = ABUSE_CATEGORY_KEYS.map((key) => ({
  value: key,
  label: ABUSE_CATEGORIES[key].label,
}));

/** The `category` of a takedown or report, with what the chosen one covers and how Risk records it. */
export function AbuseCategoryField() {
  const [category, setCategory] = useState<AbuseCategory | null>(null);
  const chosen = category ? ABUSE_CATEGORIES[category] : null;
  return (
    <Field>
      <FieldLabel>Category</FieldLabel>
      <Select
        items={ITEMS}
        name="category"
        onValueChange={(value) =>
          setCategory(typeof value === "string" && isAbuseCategory(value) ? value : null)
        }
        required
      >
        <SelectTrigger>
          <SelectValue placeholder="What kind of abuse?" />
        </SelectTrigger>
        <SelectPopup>
          {ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <FieldDescription>
        {chosen
          ? `${chosen.description} Reported to coss.com Risk as ${chosen.outcome}.`
          : "Kept on the suspension and in the audit log, and sent to coss.com Risk with the report."}
      </FieldDescription>
    </Field>
  );
}
