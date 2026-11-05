/**
 * Scheduling's variables, for each app's t3-env schema. Imports only zod: app env modules load it
 * before anything touches the database.
 */
import { z } from "zod";

const KEY_BYTES = 32;

function keysOf(value: string): Buffer[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Buffer.from(part, "base64"));
}

export const schedulingEnvShape = {
  // Encrypts attendee details and answers. Comma-separated, newest first, like WEBHOOK_SECRETS_KEY.
  SCHEDULING_DATA_KEYS: z
    .string()
    .superRefine((value, ctx) => {
      const keys = keysOf(value);
      if (keys.length === 0 || keys.some((key) => key.length !== KEY_BYTES)) {
        ctx.addIssue({
          code: "custom",
          message: "Each key must be 32 bytes, base64 (openssl rand -base64 32).",
        });
      }
    })
    .optional(),
  // The hosted app's origin (portal, booker, manage pages), on a registrable domain of its own.
  SCHEDULING_PUBLIC_URL: z.url().optional(),
  // Coss.com's OAuth apps for calendar access: each pair together, or that provider is off. These
  // aren't the dashboard's sign-in apps, which never ask for calendar scopes.
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  // Coss.com's Zoom app: meetings on hosts' accounts, and the secret token its events are signed with.
  ZOOM_CLIENT_ID: z.string().min(1).optional(),
  ZOOM_CLIENT_SECRET: z.string().min(1).optional(),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().min(1).optional(),
};

/** The keys of `SCHEDULING_DATA_KEYS`, newest first. */
export function decodeSchedulingDataKeys(value: string): Buffer[] {
  return keysOf(value);
}
