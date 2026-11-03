/**
 * Account emails: sign-up verification, password resets and invitations. Better Auth's callbacks
 * (`./options.ts`) write an `auth_email` row; the worker sends it later through an
 * `AuthEmailSender` (coss.com's own email product, wired by the worker: this package never imports a
 * product). The links carry secrets, so a row's `url` is cleared once it is settled, and the
 * worker's sender discards the stored body of the email it sends. System-level: rows belong to an
 * address, not to an organization.
 */
import { db, schema } from "@coss/db";
import { type EmailBlock, oneLine, renderEmail } from "@coss/email-layout";
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

const { authEmail, invitation, user } = schema;

const MINUTE = 60 * 1000;
/** Lifetime of an email verification link (Better Auth's `emailVerification.expiresIn`). */
export const VERIFICATION_LINK_TTL_S = 60 * 60;
/** Lifetime of a password reset link (Better Auth's `resetPasswordTokenExpiresIn`). */
export const RESET_PASSWORD_LINK_TTL_S = 60 * 60;
/** A claimed email is not picked up by another worker for this long. */
export const AUTH_EMAIL_LEASE_MS = 5 * MINUTE;
/** Attempts before an email is given up as `failed` (backoff 1, 2, 4… min). */
export const MAX_AUTH_EMAIL_ATTEMPTS = 8;
/** A missing account is retried rather than skipped for this long after the email was queued. */
const ACCOUNT_COMMIT_GRACE_MS = 5 * MINUTE;

export type AuthEmailKind = (typeof schema.authEmailKind.enumValues)[number];
export type AuthEmailRow = typeof authEmail.$inferSelect;

/** What an invitation email says (Better Auth's data at the time of the invitation). */
export type InvitationEmailData = {
  invitationId: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  /** ISO 8601. */
  expiresAt: string;
};

export type AuthEmailInput = { to: string; url: string; expiresAt: Date } & (
  | { kind: "verify_email" | "reset_password"; userId: string }
  | { kind: "invitation"; data: InvitationEmailData }
);

/** One email to one person. */
export type AuthEmailMessage = {
  /** Stable per email: senders pass it as their idempotency key, so retries never resend. */
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

/** Delivers a message; throws when it could not (the email is retried). */
export type AuthEmailSender = {
  send(message: AuthEmailMessage): Promise<void>;
};

export type AuthEmailDeps = { sender: AuthEmailSender };

/**
 * Queues an account email for the worker. Outside production the link is also printed to the
 * console (`[auth] …`), so local development works without a configured sender.
 */
export async function enqueueAuthEmail(input: AuthEmailInput, now = new Date()): Promise<void> {
  await db.insert(authEmail).values({
    kind: input.kind,
    to: input.to,
    userId: input.kind === "invitation" ? null : input.userId,
    url: input.url,
    data: input.kind === "invitation" ? input.data : {},
    expiresAt: input.expiresAt,
    nextAttemptAt: now,
    createdAt: now,
  });
  if (process.env.NODE_ENV !== "production") {
    console.info(`\n[auth] ${DEV_LABELS[input.kind]} for ${input.to}:\n  ${input.url}\n`);
  }
}

const DEV_LABELS: Record<AuthEmailKind, string> = {
  verify_email: "Verify email",
  reset_password: "Reset password",
  invitation: "Invitation",
};

/** The emails queued for these addresses, newest first (tests and admin tooling). */
export async function listAuthEmails(to: string[]): Promise<AuthEmailRow[]> {
  if (to.length === 0) return [];
  return db
    .select()
    .from(authEmail)
    .where(inArray(authEmail.to, to))
    .orderBy(desc(authEmail.createdAt), desc(authEmail.id));
}

/** Backoff after the `attempt`-th failed attempt (1-based): 1, 2, 4… minutes, at most an hour. */
function retryDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1) * MINUTE, 60 * MINUTE);
}

/**
 * Sends account emails that are due, oldest first. One whose link has expired, or that no longer
 * applies (the address is already verified, the invitation was canceled or accepted, the account
 * is banned), is skipped. Returns how many were claimed. `scope` limits the scan to some
 * addresses (tests).
 */
export async function runDueAuthEmails(
  opts: { now?: Date; limit?: number; scope?: { to: string[] } },
  deps: AuthEmailDeps,
): Promise<number> {
  const now = opts.now ?? new Date();
  const due = and(
    eq(authEmail.status, "pending"),
    isNotNull(authEmail.nextAttemptAt),
    lte(authEmail.nextAttemptAt, now),
  );
  const candidates = await db
    .select({ id: authEmail.id })
    .from(authEmail)
    .where(and(due, opts.scope ? inArray(authEmail.to, opts.scope.to) : undefined))
    .orderBy(asc(authEmail.nextAttemptAt))
    .limit(opts.limit ?? 20);

  let claimed = 0;
  for (const candidate of candidates) {
    const [row] = await db
      .update(authEmail)
      .set({
        attemptCount: sql`${authEmail.attemptCount} + 1`,
        nextAttemptAt: new Date(now.getTime() + AUTH_EMAIL_LEASE_MS),
      })
      .where(and(due, eq(authEmail.id, candidate.id)))
      .returning();
    if (!row) continue;
    claimed++;
    await deliver(row, deps, now);
  }
  return claimed;
}

async function deliver(row: AuthEmailRow, deps: AuthEmailDeps, now: Date): Promise<void> {
  // Settled rows drop their link: it is a secret, and nothing needs it any more.
  const settle = (values: Partial<typeof authEmail.$inferInsert>) =>
    db
      .update(authEmail)
      .set({ nextAttemptAt: null, url: null, ...values })
      .where(eq(authEmail.id, row.id));
  try {
    const skip = await skipReason(row, now);
    if (skip) {
      await settle({ status: "skipped", lastError: skip });
      return;
    }
    if (!row.url) throw new Error("The email has no link.");
    await deps.sender.send({
      idempotencyKey: row.id,
      to: row.to,
      ...renderAuthEmail(row.kind, { to: row.to, url: row.url, data: row.data }),
    });
    await settle({ status: "sent", sentAt: now, lastError: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auth] ${row.kind} email ${row.id} failed:`, error);
    if (row.attemptCount >= MAX_AUTH_EMAIL_ATTEMPTS) {
      await settle({ status: "failed", lastError: message });
    } else {
      await db
        .update(authEmail)
        .set({
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(row.attemptCount)),
          lastError: message,
        })
        .where(eq(authEmail.id, row.id));
    }
  }
}

async function skipReason(row: AuthEmailRow, now: Date): Promise<string | null> {
  if (row.expiresAt.getTime() <= now.getTime()) return "The link expired before it was sent.";
  if (row.kind === "invitation") {
    const invitationId = row.data.invitationId;
    const [found] = invitationId
      ? await db
          .select({ status: invitation.status })
          .from(invitation)
          .where(eq(invitation.id, invitationId))
      : [];
    return found?.status === "pending" ? null : "The invitation is no longer pending.";
  }
  if (!row.userId) return "The account is gone.";
  const [account] = await db
    .select({
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      banExpires: user.banExpires,
    })
    .from(user)
    .where(eq(user.id, row.userId));
  if (!account && now.getTime() - row.createdAt.getTime() < ACCOUNT_COMMIT_GRACE_MS) {
    // Queued from inside Better Auth's sign-up transaction, which may not have committed yet.
    throw new Error("The account does not exist yet.");
  }
  if (!account || account.email !== row.to) return "The account or its address changed.";
  if (
    account.banned &&
    (account.banExpires === null || account.banExpires.getTime() > now.getTime())
  ) {
    return "The account is banned.";
  }
  if (row.kind === "verify_email" && account.emailVerified) return "Already verified.";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Content. Organization and inviter names are chosen by users, so they are escaped, kept on one
// line in subjects, and always shown next to the inviter's address.
// ---------------------------------------------------------------------------------------------

type Message = Pick<AuthEmailMessage, "subject" | "text" | "html">;

const EXPIRY_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

export function renderAuthEmail(
  kind: AuthEmailKind,
  input: { to: string; url: string; data: Partial<Record<string, string>> },
): Message {
  const button = (label: string): EmailBlock => ({ button: { label, url: input.url } });
  let subject: string;
  let blocks: EmailBlock[];
  switch (kind) {
    case "verify_email":
      subject = "Verify your email address for coss.com";
      blocks = [
        {
          paragraph: `Confirm that ${input.to} is your email address to finish setting up coss.com.`,
        },
        button("Verify email address"),
        {
          note: "The link expires in an hour. If you didn't sign up for coss.com, you can ignore this email.",
        },
      ];
      break;
    case "reset_password":
      subject = "Reset your coss.com password";
      blocks = [
        { paragraph: `Someone asked to reset the password of the coss.com account ${input.to}.` },
        button("Choose a new password"),
        {
          note:
            "The link expires in an hour and works once. If you didn't ask for this, you can " +
            "ignore this email: your password stays the same.",
        },
      ];
      break;
    case "invitation": {
      const organization = oneLine(input.data.organizationName ?? "");
      const inviter = oneLine(input.data.inviterName ?? "");
      const inviterEmail = input.data.inviterEmail ?? "";
      const role = input.data.role === "admin" ? "an admin" : "a member";
      subject = `You're invited to join ${organization} on coss.com`;
      blocks = [
        {
          paragraph:
            `${inviter ? `${inviter} (${inviterEmail})` : inviterEmail} invited you to join the ` +
            `organization "${organization}" on coss.com as ${role}.`,
        },
        button("View the invitation"),
        {
          note:
            `Sign in or sign up with ${input.to} to accept it.` +
            (input.data.expiresAt
              ? ` It expires on ${EXPIRY_FORMAT.format(new Date(input.data.expiresAt))} UTC.`
              : "") +
            " If you weren't expecting it, you can ignore this email.",
        },
      ];
      break;
    }
  }
  return renderEmail({ subject, blocks });
}
