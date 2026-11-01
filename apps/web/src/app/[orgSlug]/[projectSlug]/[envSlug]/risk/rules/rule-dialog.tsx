"use client";

import {
  RISK_DECISIONS,
  RISK_EVENTS,
  type RiskRuleConditionOutput,
  type RiskRuleOutput,
  RULE_FIELDS,
  RULE_OPERATORS,
  type RuleField,
} from "@coss/risk/schemas";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import { saveRiskRuleAction } from "../actions";

type Target = { orgSlug: string; projectSlug: string; envSlug: string };

const FIELD_ITEMS = Object.entries(RULE_FIELDS).map(([value, field]) => ({
  value,
  label: field.label,
}));

const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  eq: "equals",
  neq: "doesn't equal",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "is one of",
  not_in: "is none of",
};

/** A condition as edited: the value as typed (lists comma-separated). */
type Draft = { field: RuleField; operator: string; value: string };

function toDraft(condition: RiskRuleConditionOutput): Draft {
  const value = Array.isArray(condition.value)
    ? condition.value.join(", ")
    : String(condition.value);
  return { field: condition.field, operator: condition.operator, value };
}

function fromDraft(draft: Draft): { field: RuleField; operator: string; value: unknown } {
  const { type } = RULE_FIELDS[draft.field];
  const value =
    type === "boolean"
      ? draft.value === "true"
      : type === "number"
        ? Number(draft.value)
        : draft.operator === "in" || draft.operator === "not_in"
          ? draft.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : draft.value.trim();
  return { field: draft.field, operator: draft.operator, value };
}

function blankCondition(field: RuleField = "email.disposable"): Draft {
  const { type } = RULE_FIELDS[field];
  return {
    field,
    operator: RULE_OPERATORS[type][0],
    value: type === "boolean" ? "true" : "",
  };
}

export function RuleDialog(props: Target & { rule?: RiskRuleOutput; trigger: "create" | "edit" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            size={props.trigger === "create" ? "sm" : "xs"}
            variant={props.trigger === "create" ? "default" : "outline"}
          />
        }
      >
        {props.trigger === "create" ? "New rule" : "Edit"}
      </DialogTrigger>
      <DialogPopup className="max-w-2xl">
        {/* The popup unmounts when closed, which also resets the form. */}
        <RuleForm {...props} onDone={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function RuleForm(props: Target & { rule?: RiskRuleOutput; onDone: () => void }) {
  const [state, formAction, pending] = useActionToast(saveRiskRuleAction, {
    success: props.rule ? "Rule saved" : "Rule created",
  });
  const [name, setName] = useState(props.rule?.name ?? "");
  const [action, setAction] = useState<string>(props.rule?.action ?? "block");
  const [match, setMatch] = useState<string>(props.rule?.match ?? "all");
  const [events, setEvents] = useState<Set<string>>(new Set(props.rule?.events ?? []));
  const [position, setPosition] = useState(String(props.rule?.position ?? 0));
  const [conditions, setConditions] = useState<Draft[]>(
    props.rule ? props.rule.conditions.map(toDraft) : [blankCondition()],
  );
  const { onDone } = props;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const update = (index: number, change: Partial<Draft>) =>
    setConditions((current) =>
      current.map((condition, i) => {
        if (i !== index) return condition;
        // A new field resets the operator and value to ones that fit it.
        return change.field ? blankCondition(change.field) : { ...condition, ...change };
      }),
    );

  const rule = {
    name,
    action,
    match,
    events: [...events],
    position: Number(position),
    conditions: conditions.map(fromDraft),
  };

  return (
    // `contents` keeps header/panel/footer as direct flex children of the popup (coss ui pattern).
    <form action={formAction} className="contents">
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="ruleId" type="hidden" value={props.rule?.id ?? ""} />
      <input name="rule" type="hidden" value={JSON.stringify(rule)} />
      <DialogHeader>
        <DialogTitle>{props.rule ? "Edit rule" : "New rule"}</DialogTitle>
        <DialogDescription>
          After the allow and block lists, the first enabled rule whose conditions match decides. A
          field without a value (no IP, no email) never matches.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              autoFocus
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Disposable email from a data center"
              required
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel>Then</FieldLabel>
            <Select
              items={RISK_DECISIONS.map((value) => ({ value, label: value }))}
              onValueChange={(value) => setAction(String(value))}
              value={action}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {RISK_DECISIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Position</FieldLabel>
            <Input
              className="w-24"
              min={0}
              onChange={(event) => setPosition(event.target.value)}
              type="number"
              value={position}
            />
          </Field>
        </div>

        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 font-medium text-sm">Events (none checked: every event)</legend>
          {RISK_EVENTS.map((event) => (
            <Label className="gap-2" key={event}>
              <Checkbox
                checked={events.has(event)}
                onCheckedChange={(checked) =>
                  setEvents((current) => {
                    const next = new Set(current);
                    if (checked) next.add(event);
                    else next.delete(event);
                    return next;
                  })
                }
              />
              {event}
            </Label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            When
            <Select
              items={[
                { value: "all", label: "all" },
                { value: "any", label: "any" },
              ]}
              onValueChange={(value) => setMatch(String(value))}
              value={match}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="any">any</SelectItem>
              </SelectPopup>
            </Select>
            of these hold:
          </div>
          {conditions.map((condition, index) => {
            const { type } = RULE_FIELDS[condition.field];
            const operators = RULE_OPERATORS[type];
            return (
              // Conditions have no identity of their own; their position is their key.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <div className="flex flex-wrap items-center gap-2" key={index}>
                <Select
                  items={FIELD_ITEMS}
                  onValueChange={(value) => update(index, { field: value as RuleField })}
                  value={condition.field}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {FIELD_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <Select
                  items={operators.map((value) => ({ value, label: OPERATOR_LABELS[value] }))}
                  onValueChange={(value) => update(index, { operator: String(value) })}
                  value={condition.operator}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {operators.map((value) => (
                      <SelectItem key={value} value={value}>
                        {OPERATOR_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {type === "boolean" ? (
                  <Select
                    items={[
                      { value: "true", label: "true" },
                      { value: "false", label: "false" },
                    ]}
                    onValueChange={(value) => update(index, { value: String(value) })}
                    value={condition.value}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectPopup>
                  </Select>
                ) : (
                  <Input
                    aria-label="Value"
                    className="w-48"
                    onChange={(event) => update(index, { value: event.target.value })}
                    placeholder={
                      type === "number"
                        ? "e.g. 5"
                        : condition.operator === "in" || condition.operator === "not_in"
                          ? "e.g. DE, AT"
                          : "Value"
                    }
                    required
                    step={type === "number" ? "any" : undefined}
                    type={type === "number" ? "number" : "text"}
                    value={condition.value}
                  />
                )}
                {conditions.length > 1 ? (
                  <Button
                    onClick={() =>
                      setConditions((current) => current.filter((_, i) => i !== index))
                    }
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            );
          })}
          {conditions.length < 20 ? (
            <div>
              <Button
                onClick={() => setConditions((current) => [...current, blankCondition()])}
                size="xs"
                type="button"
                variant="outline"
              >
                Add condition
              </Button>
            </div>
          ) : null}
        </div>
        {state && !state.ok ? <FormError message={state.error} /> : null}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          {props.rule ? "Save rule" : "Create rule"}
        </Button>
      </DialogFooter>
    </form>
  );
}
