import "server-only";
import { BillingError } from "@coss/billing";
import {
  BroadcastError,
  ContactError,
  DomainError,
  EmailError,
  InboxError,
  SubaccountError,
} from "@coss/email";
import { FormError } from "@coss/forms";
import { HookError } from "@coss/hooks";
import { ReputationError } from "@coss/reputation";
import { SupportError } from "@coss/support";
import { TenancyError } from "@coss/tenancy";
import { isAPIError } from "better-auth/api";
import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "./action-result";

/** A failure whose message is safe to show to the user as-is. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export class ForbiddenError extends ActionError {
  constructor(message = "You don't have permission to do that in this organization.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Runs an action body and converts expected failures into `{ ok: false, error }`. Next.js control
 * flow (`redirect()`, `notFound()`) is rethrown; unexpected errors are logged and hidden.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: userFacingMessage(error) };
  }
}

function userFacingMessage(error: unknown): string {
  if (
    error instanceof ActionError ||
    error instanceof TenancyError ||
    error instanceof DomainError ||
    error instanceof ContactError ||
    error instanceof BroadcastError ||
    error instanceof ReputationError ||
    error instanceof EmailError ||
    error instanceof InboxError ||
    error instanceof SubaccountError ||
    error instanceof BillingError ||
    error instanceof HookError ||
    error instanceof FormError ||
    error instanceof SupportError
  ) {
    return error.message;
  }
  // Better Auth errors carry end-user messages (e.g. "User is already a member").
  if (isAPIError(error) && error.message) return error.message;
  console.error("[web] Unexpected server action error:", error);
  return "Something went wrong. Please try again.";
}

/** Trimmed string field from a form submission ("" when missing or not a string). */
export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
