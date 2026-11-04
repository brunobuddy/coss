/** Attendee details and answers are encrypted at rest; email lookups go through an HMAC. */
import { createHmac } from "node:crypto";
import { decryptSecret, encryptSecret } from "@coss/webhooks";
import type { AttendeeInputOutput } from "./schemas.ts";
import type { SchedulingDeps } from "./types.ts";

export type AttendeeContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type BookingAnswers = Record<string, string | string[]>;
export type RoutingAttributes = Record<string, string | string[]>;
type Keys = Pick<SchedulingDeps, "dataKeys" | "lookupKey">;

export function emailLookup(email: string, keys: Pick<Keys, "lookupKey">): string {
  return createHmac("sha256", keys.lookupKey)
    .update(`scheduling-attendee-email\0${email.trim().toLowerCase()}`)
    .digest("hex");
}

export function encryptContact(attendee: AttendeeInputOutput, keys: Keys) {
  const contact: AttendeeContact = {
    name: attendee.name ?? null,
    email: attendee.email ?? null,
    phone: attendee.phone ?? null,
  };
  const empty = !contact.name && !contact.email && !contact.phone;
  return {
    encryptedContact: empty ? null : encryptSecret(JSON.stringify(contact), keys.dataKeys),
    emailHmac: contact.email ? emailLookup(contact.email, keys) : null,
  };
}

export function decryptContact(
  stored: string | null,
  keys: Pick<Keys, "dataKeys">,
): AttendeeContact {
  if (!stored) return { name: null, email: null, phone: null };
  return JSON.parse(decryptSecret(stored, keys.dataKeys)) as AttendeeContact;
}

export function encryptAnswers(answers: BookingAnswers | undefined, keys: Keys): string | null {
  if (!answers || Object.keys(answers).length === 0) return null;
  return encryptSecret(JSON.stringify(answers), keys.dataKeys);
}

/** Always stored, even empty: null means the routing can't be known, which is a different answer. */
export function encryptRouting(
  attributes: RoutingAttributes | undefined,
  keys: Pick<Keys, "dataKeys">,
): string {
  return encryptSecret(JSON.stringify(attributes ?? {}), keys.dataKeys);
}

/** Null when a booking can't say what it was routed with, so nobody may guess that it was nothing. */
export function decryptRouting(
  stored: string | null,
  keys: Pick<Keys, "dataKeys">,
): RoutingAttributes | null {
  if (!stored) return null;
  return JSON.parse(decryptSecret(stored, keys.dataKeys)) as RoutingAttributes;
}

export function decryptAnswers(
  stored: string | null,
  keys: Pick<Keys, "dataKeys">,
): BookingAnswers {
  if (!stored) return {};
  return JSON.parse(decryptSecret(stored, keys.dataKeys)) as BookingAnswers;
}
