import "server-only";
import { supportPlanAt } from "@coss/billing";
import { type SupportAuthor, type SupportFileStore, supportStoreFromEnv } from "@coss/support";
import { env } from "@/env";
import { ActionError } from "./actions";

export const supportDeps = { planFor: supportPlanAt };

let store: SupportFileStore | null | undefined;

export function supportStore(): SupportFileStore | null {
  store ??= supportStoreFromEnv(env);
  return store;
}

type SessionLike = {
  user: { id: string; name: string; email: string };
  session: { impersonatedBy?: string | null };
};

export function supportAuthor(session: SessionLike): SupportAuthor {
  return { userId: session.user.id, name: session.user.name, email: session.user.email };
}

/** An admin impersonating someone must never be able to write as them. */
export function refuseImpersonation(session: SessionLike): void {
  if (session.session.impersonatedBy) {
    throw new ActionError("You can't write to support while impersonating someone.");
  }
}

/** Ids posted by the composer; they're checked again when claimed. */
export function attachmentIdsOf(formData: FormData): string[] {
  return formData
    .getAll("attachmentIds")
    .filter((value): value is string => typeof value === "string" && value.startsWith("tatt_"));
}

const MINUTE = 60 * 1000;

/** "Overdue by 2h", "Due in 35m": how a clock reads at a glance. */
export function formatDue(due: Date, now: Date): { label: string; overdue: boolean } {
  const ms = due.getTime() - now.getTime();
  const overdue = ms < 0;
  const minutes = Math.round(Math.abs(ms) / MINUTE);
  const span =
    minutes < 60
      ? `${minutes}m`
      : minutes < 48 * 60
        ? `${Math.round(minutes / 60)}h`
        : `${Math.round(minutes / (24 * 60))}d`;
  return { label: overdue ? `Overdue ${span}` : `Due in ${span}`, overdue };
}
