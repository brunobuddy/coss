/**
 * Screens one outgoing message, the entry point for every product: decides whether it is
 * sampled, asks the classifier, records the verdict and acts on it. A classifier error records an
 * error verdict. Enforced screening blocks that message (the product holds it and retries it with
 * `retry`, screening it again); shadow screening and coss.com's own notification organization send it
 * and owe the sample to the next message, once.
 */
import { isHipaaMode } from "@coss/compliance";
import { db, type Executor, schema } from "@coss/db";
import {
  getReputationStanding,
  markReputationDue,
  policyOf,
  suspendOrganization,
} from "@coss/reputation";
import type { ContentScreeningPolicy } from "@coss/reputation/schemas";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  type ClassifierVerdict,
  type ContentClassifier,
  type ScreeningContent,
  type ScreeningProduct,
  topCategory,
} from "./classifier.ts";
import { shouldScreen } from "./sampling.ts";

const { contentScreening, contentScreeningCounter } = schema;

export type ContentScreeningRow = typeof contentScreening.$inferSelect;
export type ScreeningVerdict = ContentScreeningRow["verdict"];

/** The reputation trigger of screening suspensions and warnings. */
export const CONTENT_SCREENING_TRIGGER = "content_screening";

/** Long enough for a slow decision (Jev answers in well under a second), short enough to send on. */
export const DEFAULT_SCREENING_TIMEOUT_MS = 10_000;
/** Two distinct high-scoring flags in the reputation window stop sending. */
export const REPEATED_FLAG_THRESHOLD = 0.9;

export type ScreeningDeps = {
  classifier: ContentClassifier;
  timeoutMs?: number;
  now?: () => Date;
  /** Drives the random part of sampling (tests). */
  random?: () => number;
  /**
   * coss.com's own organization (account and notification emails): a block verdict only flags its
   * message, so screening never refuses those emails or suspends the organization sending them.
   */
  systemOrganizationId?: string | null;
};

export type ScreenInput = {
  organizationId: string;
  environmentId: string;
  product: ScreeningProduct;
  /** The product's message id, e.g. an email id. */
  subjectId: string;
  /** Called only when the message is sampled, so unsampled messages cost nothing. */
  content: (signal: AbortSignal) => ScreeningContent | Promise<ScreeningContent>;
  /** Product-specific abuse memory, written atomically with an enforced block. */
  onBlock?: (tx: Executor, now: Date) => Promise<void>;
  /**
   * The message was held after its screening failed and is being tried again: it is screened
   * again (it was a sample), at its earlier position, without being counted twice.
   */
  retry?: boolean;
  /**
   * Screen it whatever the sampling says: one message about to reach many recipients (a
   * broadcast, screened once for all of them).
   */
  force?: boolean;
  /**
   * A group of the organization sampled and enforced on its own (an email sub-account): its
   * messages are counted apart (so its first ones are always screened), its verdicts are recorded
   * with its id, and a block calls `onBlock` in the verdict's transaction instead of suspending
   * the organization. The organization's own screening check leaves group verdicts out.
   */
  group?: {
    id: string;
    /** Read the group's current reset time; lock its standing row when called in a transaction. */
    reinstatedAt?: (tx: Executor) => Promise<Date | null>;
    onBlock: (tx: Executor, input: { trigger: string; note: string; now: Date }) => Promise<void>;
  };
};

export type ScreenOutcome = {
  /**
   * `block`: refuse the message after an enforced block, or hold it after a classifier error
   * (`screening.verdict` is `error`).
   */
  action: "send" | "block";
  screening: ContentScreeningRow | null;
};

const SEND: ScreenOutcome = { action: "send", screening: null };

/** Call for live messages only, once per message, right before it is handed to the provider. */
export async function screenMessage(
  input: ScreenInput,
  deps: ScreeningDeps,
): Promise<ScreenOutcome> {
  // Before any policy: an admin's override can't send these organizations' messages to the model.
  if (await isHipaaMode(input.organizationId)) return SEND;
  const now = deps.now ?? (() => new Date());
  const standing = await getReputationStanding(input.organizationId);
  const reputationPolicy = policyOf(standing);
  const policy = reputationPolicy.contentScreening;
  if (!policy.enabled) return SEND;
  const timestamp = now();
  const resetAt = input.group ? await input.group.reinstatedAt?.(db) : standing?.reinstatedAt;
  const windowStart = new Date(
    Math.max(
      timestamp.getTime() - reputationPolicy.windowDays * 86_400_000,
      resetAt?.getTime() ?? 0,
    ),
  );

  const earlier = input.retry ? await earlierSample(input, now()) : null;
  const { sequence, owed } =
    earlier ?? (await countMessage(input.organizationId, input.product, input.group?.id ?? ""));
  if (!earlier && !owed && !input.force && !shouldScreen(sequence, policy, deps.random)) {
    // A warning must increase scrutiny even before the reputation worker evaluates it.
    if (!(await recentFlag(db, input, windowStart, timestamp))) return SEND;
  }
  const isSystemOrganization = input.organizationId === deps.systemOrganizationId;

  const started = performance.now();
  let verdict: ClassifierVerdict;
  try {
    const signal = AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_SCREENING_TIMEOUT_MS);
    const content = await input.content(signal);
    signal.throwIfAborted();
    verdict = await deps.classifier.classify(content, signal);
  } catch (error) {
    console.error(
      `[screening] ${deps.classifier.name} failed on ${input.product} ${input.subjectId}:`,
      error instanceof Error ? `${error.name}: ${error.message}` : error,
    );
    // Enforced screening holds this message and screens it again when it is retried, so nothing is
    // owed. Otherwise it is sent unscreened and the sample passes to the next message, once: a
    // sample that was itself owed (or retried) doesn't pass it on again, so an outage doesn't put
    // every following message through a failing classifier.
    const sentAnyway = !policy.enforce || isSystemOrganization;
    const screening = await db.transaction(async (tx) => {
      if (sentAnyway && !owed && !earlier) {
        await tx
          .update(contentScreeningCounter)
          .set({ owed: true })
          .where(
            and(
              eq(contentScreeningCounter.organizationId, input.organizationId),
              eq(contentScreeningCounter.product, input.product),
              eq(contentScreeningCounter.groupId, input.group?.id ?? ""),
            ),
          );
      }
      return insertScreening(tx, input, {
        sequence,
        classifier: deps.classifier.name,
        verdict: "error",
        enforced: policy.enforce,
        latencyMs: elapsed(started),
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
        createdAt: now(),
      });
    });
    return { action: sentAnyway ? "send" : "block", screening };
  }

  const top = topCategory(verdict.scores);
  let outcome = classify(top.score, policy, isSystemOrganization);
  let createdAt = now();
  const screening = await db.transaction(async (tx) => {
    if (policy.enforce && !isSystemOrganization && outcome !== "clean") {
      // Classify outside the lock; serialize only evidence and the decision so simultaneous
      // high flags cannot both escape as the first one. Retries of one subject count once.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`screening:${input.organizationId}:${input.group?.id ?? ""}`}, 0))`,
      );
      createdAt = now();
      // Support may have reinstated this scope while the model was answering. Its earlier
      // flags were reviewed and must not immediately suspend it again.
      const [latest] = input.group
        ? []
        : await tx
            .select({ reinstatedAt: schema.reputationStanding.reinstatedAt })
            .from(schema.reputationStanding)
            .where(eq(schema.reputationStanding.organizationId, input.organizationId))
            .for("update");
      const latestReset = input.group ? await input.group.reinstatedAt?.(tx) : latest?.reinstatedAt;
      const currentWindowStart = new Date(
        Math.max(windowStart.getTime(), latestReset?.getTime() ?? 0),
      );
      if (
        outcome === "flagged" &&
        top.score >= REPEATED_FLAG_THRESHOLD &&
        (await recentFlag(tx, input, currentWindowStart, createdAt, true))
      ) {
        outcome = "blocked";
      }
    }
    const row = await insertScreening(tx, input, {
      sequence,
      classifier: deps.classifier.name,
      model: verdict.model,
      verdict: outcome,
      enforced: policy.enforce,
      scores: verdict.scores,
      topCategory: top.category,
      topScore: top.score,
      inputTokens: verdict.inputTokens,
      latencyMs: elapsed(started),
      createdAt,
    });
    if (!policy.enforce || outcome === "clean") return row;
    const repeated = outcome === "blocked" && top.score < policy.blockThreshold;
    const note = `${input.product} ${input.subjectId} scored ${top.score.toFixed(2)} for ${top.category} (${row.id}).${repeated ? " Repeated high-scoring flags." : ""}`;
    if (input.group) {
      // The group answers for its own messages; its flags only show in the admin console.
      if (outcome === "blocked") {
        await input.group.onBlock(tx, { trigger: CONTENT_SCREENING_TRIGGER, note, now: createdAt });
        await input.onBlock?.(tx, createdAt);
      }
      return row;
    }
    if (outcome === "blocked") {
      await suspendOrganization(
        {
          organizationId: input.organizationId,
          trigger: CONTENT_SCREENING_TRIGGER,
          actor: { kind: "system" },
          note,
          now: createdAt,
        },
        tx,
      );
      // Match reinstatement/backfill lock order: standing first, then domain abuse memory.
      await input.onBlock?.(tx, createdAt);
    }
    // The content screening check turns flags into a warning (and keeps a block suspended).
    await markReputationDue(tx, input.organizationId, createdAt);
    return row;
  });
  return { action: policy.enforce && outcome === "blocked" ? "block" : "send", screening };
}

async function recentFlag(tx: Executor, input: ScreenInput, start: Date, end: Date, high = false) {
  const [flag] = await tx
    .select({ id: contentScreening.id })
    .from(contentScreening)
    .where(
      and(
        eq(contentScreening.organizationId, input.organizationId),
        input.group
          ? eq(contentScreening.groupId, input.group.id)
          : isNull(contentScreening.groupId),
        eq(contentScreening.verdict, "flagged"),
        eq(contentScreening.enforced, true),
        gte(contentScreening.createdAt, start),
        lte(contentScreening.createdAt, end),
        high ? gte(contentScreening.topScore, REPEATED_FLAG_THRESHOLD) : undefined,
        high
          ? sql`not (${contentScreening.product} = ${input.product} and ${contentScreening.subjectId} = ${input.subjectId})`
          : undefined,
      ),
    )
    .limit(1);
  return Boolean(flag);
}

function classify(
  score: number,
  policy: ContentScreeningPolicy,
  isSystemOrganization: boolean,
): ScreeningVerdict {
  if (score >= policy.blockThreshold) return isSystemOrganization ? "flagged" : "blocked";
  if (score >= policy.flagThreshold) return "flagged";
  return "clean";
}

/** How long a held message's earlier sample is looked for (held messages give up within an hour). */
const RETRY_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * The position of a retried message's failed screening, so it is screened again where it was
 * sampled; `null` when there is none (it is then counted as a new message).
 */
async function earlierSample(
  input: ScreenInput,
  now: Date,
): Promise<{ sequence: number; owed: false } | null> {
  const [row] = await db
    .select({ sequence: contentScreening.sequence })
    .from(contentScreening)
    .where(
      and(
        eq(contentScreening.organizationId, input.organizationId),
        gte(contentScreening.createdAt, new Date(now.getTime() - RETRY_LOOKBACK_MS)),
        eq(contentScreening.product, input.product),
        eq(contentScreening.subjectId, input.subjectId),
      ),
    )
    .orderBy(desc(contentScreening.createdAt))
    .limit(1);
  return row ? { sequence: row.sequence, owed: false } : null;
}

/**
 * Counts the message and returns its position plus whether a failed screening left a sample
 * owed (consumed here). One statement, so concurrent workers never share a position.
 */
async function countMessage(
  organizationId: string,
  product: ScreeningProduct,
  groupId: string,
): Promise<{ sequence: number; owed: boolean }> {
  const result = await db.execute<{ seen: number; owed: boolean | null }>(sql`
    INSERT INTO ${contentScreeningCounter} (organization_id, product, group_id, seen, owed)
    VALUES (${organizationId}, ${product}, ${groupId}, 1, false)
    ON CONFLICT (organization_id, product, group_id)
    DO UPDATE SET seen = ${contentScreeningCounter}.seen + 1, owed = false, updated_at = now()
    RETURNING new.seen AS seen, old.owed AS owed
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Counting the message returned no row.");
  return { sequence: Number(row.seen), owed: row.owed === true };
}

async function insertScreening(
  tx: Executor,
  input: ScreenInput,
  values: Omit<
    typeof contentScreening.$inferInsert,
    "organizationId" | "environmentId" | "product" | "subjectId"
  >,
): Promise<ContentScreeningRow> {
  const [row] = await tx
    .insert(contentScreening)
    .values({
      organizationId: input.organizationId,
      environmentId: input.environmentId,
      product: input.product,
      subjectId: input.subjectId,
      groupId: input.group?.id ?? null,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Inserting the screening returned no row.");
  return row;
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
