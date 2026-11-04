/**
 * A file of contacts for `coss contacts import`: a CSV (what `coss contacts export` writes, or
 * another tool's export: an email column, `First Name`-style headers; or just addresses, one per
 * line), or a JSON array of the API's import entries.
 */
import type { ContactPropertyType, ImportContactEntry } from "coss";
import { UsageError } from "./errors.ts";

/** A CSV's rows (RFC 4180, with or without a BOM and carriage returns), blank lines left out. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };
  const body = text.replace(/^﻿/, "");
  for (let index = 0; index < body.length; index++) {
    const char = body.charAt(index);
    if (quoted) {
      if (char !== '"') cell += char;
      else if (body.charAt(index + 1) === '"') {
        cell += '"';
        index++;
      } else quoted = false;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") endRow();
    else if (char !== "\r") cell += char;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Exports put a `'` before cells a spreadsheet would run as formulas; it isn't part of the value. */
function plain(cell: string): string {
  return /^'['=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell;
}

/** `First Name`, `first-name`, `firstName` → `first_name`. */
function headerName(cell: string): string {
  return cell
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const COLUMNS: Record<string, "email" | "first_name" | "last_name" | "status" | "skip"> = {
  email: "email",
  email_address: "email",
  address: "email",
  first_name: "first_name",
  firstname: "first_name",
  given_name: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  family_name: "last_name",
  surname: "last_name",
  status: "status",
  created_at: "skip",
  updated_at: "skip",
  id: "skip",
};

function propertyValue(type: ContactPropertyType, text: string): string | number | boolean {
  if (type === "number" && Number.isFinite(Number(text))) return Number(text);
  if (type === "boolean" && (text === "true" || text === "false")) return text === "true";
  return text;
}

export type ContactsFile = {
  contacts: ImportContactEntry[];
  /** Columns that are neither a contact's field nor one of the environment's properties. */
  ignored: string[];
};

/** A file starting with `[` is JSON: no CSV of contacts does. */
export function isJsonContacts(text: string): boolean {
  return text.trimStart().startsWith("[");
}

export function contactsFromJson(text: string): ContactsFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UsageError("That file looks like JSON but doesn't parse.");
  }
  if (!Array.isArray(value)) throw new UsageError("A JSON file of contacts is an array.");
  return { contacts: value as ImportContactEntry[], ignored: [] };
}

export function contactsFromCsv(
  text: string,
  properties: ReadonlyMap<string, ContactPropertyType>,
): ContactsFile {
  const [first, ...rest] = parseCsv(text);
  if (!first) return { contacts: [], ignored: [] };
  // No header: the first column is the address.
  if (plain(first[0] ?? "").includes("@")) {
    return {
      contacts: [first, ...rest].map((row) => ({ email: plain(row[0] ?? "").trim() })),
      ignored: [],
    };
  }
  const names = first.map(headerName);
  if (!names.some((name) => COLUMNS[name] === "email")) {
    throw new UsageError('The header row needs an "email" column.');
  }
  const contacts = rest.map((row) => {
    const entry: ImportContactEntry = { email: "" };
    const values: Record<string, string | number | boolean> = {};
    names.forEach((name, index) => {
      const text = plain(row[index] ?? "").trim();
      if (text === "") return;
      const column = COLUMNS[name];
      const property = properties.get(name);
      if (column === "email") entry.email = text;
      else if (column === "first_name") entry.first_name = text;
      else if (column === "last_name") entry.last_name = text;
      else if (column === "status") entry.status = text;
      else if (column === undefined && property) values[name] = propertyValue(property, text);
    });
    if (Object.keys(values).length > 0) entry.properties = values;
    return entry;
  });
  const ignored = first
    .filter((_, index) => {
      const name = names[index] ?? "";
      return COLUMNS[name] === undefined && !properties.has(name);
    })
    .map((cell) => cell.trim())
    .filter(Boolean);
  return { contacts, ignored };
}
