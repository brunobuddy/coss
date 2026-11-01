"use client";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@coss/ui/components/input-group";
import { useState } from "react";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A brand colour: a swatch that opens the system picker, beside its hex code. */
export function ColorInput(props: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
}) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  const valid = HEX.test(value);
  return (
    <InputGroup className="max-w-48">
      <InputGroupAddon>
        <label className="relative flex size-5 cursor-pointer overflow-hidden rounded-md shadow-[inset_0_0_0_1px_--theme(--color-black/12%)]">
          <span
            className="absolute inset-0"
            style={{
              background: valid
                ? value
                : "repeating-conic-gradient(var(--muted) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px",
            }}
          />
          <input
            aria-label="Pick a colour"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            onChange={(event) => setValue(event.currentTarget.value)}
            type="color"
            value={valid ? value : "#000000"}
          />
        </label>
      </InputGroupAddon>
      <InputGroupInput
        autoComplete="off"
        className="font-mono uppercase"
        id={props.id}
        maxLength={7}
        name={props.name}
        onChange={(event) => {
          const text = event.currentTarget.value.trim();
          setValue(text && !text.startsWith("#") ? `#${text}` : text);
        }}
        placeholder={props.placeholder ?? "#2563EB"}
        spellCheck={false}
        value={value}
      />
    </InputGroup>
  );
}
