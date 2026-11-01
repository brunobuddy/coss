"use client";

import { cn } from "@coss/ui/lib/utils";
import { XIcon } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useId, useRef, useState } from "react";

const SPLIT = /[\s,;]+/;

/**
 * A list of short values (addresses, domains, origins, tags) as chips: Enter, a comma, a space or
 * a paste adds, Backspace takes the last one back. Posts them joined by `separator` under `name`,
 * the format the action already parses. `check` marks values it would refuse.
 */
export function ListInput(props: {
  name?: string;
  defaultValue?: string | string[];
  /** Controlled use (a builder keeping rows in state). */
  value?: string[];
  onValueChange?: (values: string[]) => void;
  separator?: string;
  placeholder?: string;
  check?: (value: string) => boolean;
  normalize?: (value: string) => string;
  /** How a chip reads ("DE" → "Germany"); the value is still what posts. */
  display?: (value: string) => string;
  inputMode?: "email" | "url" | "text" | "numeric" | "tel";
  /** Split only on commas and newlines (values that contain spaces). */
  keepSpaces?: boolean;
  /** Only Enter and line breaks separate values (values that contain commas too). */
  linesOnly?: boolean;
  id?: string;
  "aria-invalid"?: boolean;
  autoFocus?: boolean;
}) {
  const generated = useId();
  const split = props.linesOnly ? /\n+/ : props.keepSpaces ? /[,;\n]+/ : SPLIT;
  const clean = (text: string) =>
    text
      .split(split)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => props.normalize?.(value) ?? value);
  const [own, setOwn] = useState<string[]>(() =>
    Array.isArray(props.defaultValue)
      ? props.defaultValue
      : [...new Set(clean(props.defaultValue ?? ""))],
  );
  const values = props.value ?? own;
  const setValues = (change: (current: string[]) => string[]) => {
    const next = change(values);
    if (props.value === undefined) setOwn(next);
    props.onValueChange?.(next);
  };
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const add = (text: string) => {
    const next = clean(text);
    if (next.length) setValues((current) => [...new Set([...current, ...next])]);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "Enter" ||
      (!props.linesOnly && (event.key === "," || (event.key === " " && !props.keepSpaces)))
    ) {
      if (!draft.trim()) {
        if (event.key !== "Enter") event.preventDefault();
        return;
      }
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && values.length) {
      event.preventDefault();
      const last = values.at(-1) ?? "";
      setValues((current) => current.slice(0, -1));
      setDraft(last);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!split.test(text)) return;
    event.preventDefault();
    add(`${draft}${text}`);
  };

  const all = draft.trim() ? [...values, ...clean(draft)] : values;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the box focuses its input.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the input itself takes the keys.
    <div
      aria-invalid={props["aria-invalid"]}
      className="relative flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-background p-1 text-base shadow-xs/5 ring-ring/24 transition-shadow focus-within:border-ring focus-within:ring-[3px] aria-invalid:border-destructive/36 sm:min-h-8 sm:text-sm dark:bg-input/32"
      data-slot="input-group"
      onClick={() => input.current?.focus()}
    >
      {props.name ? (
        <input name={props.name} type="hidden" value={all.join(props.separator ?? ", ")} />
      ) : null}
      {values.map((value) => {
        const bad = props.check ? !props.check(value) : false;
        return (
          <span
            className={cn(
              "inline-flex h-6 max-w-full items-center gap-0.5 rounded-md border bg-muted/72 ps-2 pe-0.5 font-mono text-xs shadow-[inset_0_1px_--theme(--color-white/50%)] sm:h-5.5 dark:shadow-none",
              bad && "border-destructive/40 bg-destructive/8 text-destructive",
            )}
            key={value}
            title={bad ? "This doesn't look right" : undefined}
          >
            <span className="truncate">{props.display ? props.display(value) : value}</span>
            {props.display && props.display(value) !== value ? (
              <span className="ms-1 text-muted-foreground">{value}</span>
            ) : null}
            <button
              aria-label={`Remove ${value}`}
              className="flex size-4.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setValues((current) => current.filter((item) => item !== value));
              }}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
      <input
        autoComplete="off"
        // biome-ignore lint/a11y/noAutofocus: only where the dialog's first field asks for it.
        autoFocus={props.autoFocus}
        className="h-6 min-w-24 flex-1 bg-transparent px-1.5 outline-none placeholder:text-muted-foreground/72 sm:h-5.5"
        id={props.id ?? generated}
        inputMode={props.inputMode}
        onBlur={() => draft.trim() && add(draft)}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={values.length ? undefined : props.placeholder}
        ref={input}
        value={draft}
      />
    </div>
  );
}
