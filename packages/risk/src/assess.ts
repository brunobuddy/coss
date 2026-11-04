/**
 * `POST /v1/risk/assessments`: collects the signals of one event (email, domain age, IP,
 * captcha, content, velocity, lists, what the environment remembers), turns them into reasons, a score and
 * a decision (lists, then the environment's rules, then its thresholds), and stores the
 * assessment with its log line, mailbox identity, login networks and (for `review`) webhook in one
 * transaction.
 *
 * Every signal is best-effort: a slow DNS lookup, missing IP data, a failed classification, a slow
 * IP privacy provider or an unreachable Valkey make the assessment go without it (listed in
 * `degraded`) rather than fail. Billing never fails one either (`./billing.ts`).
 */
import type { UsageGate } from "@coss/billing/gate";
import { recordUsage } from "@coss/billing/metering";
import { db, type Executor, schema, type Transaction } from "@coss/db";
import { ID_PREFIXES, newId } from "@coss/db/id";
import { IDEMPOTENCY_KEY_TTL_MS, isReplayOf, requestHash } from "@coss/db/idempotency";
import { appendLogEntries } from "@coss/logs";
import { enqueuePush } from "@coss/push";
import type { RateLimitStore } from "@coss/ratelimit";
import type { ContentClassifier } from "@coss/screening/classifier";
import { type CaptchaVerdict, verifyCaptcha } from "@coss/signals/captcha";
import { analyzeEmail, type EmailAnalysis, type MailDomainVerdict } from "@coss/signals/email";
import { isBlockedAddress, normalizeIp, subnetOf } from "@coss/signals/ip";
import { enqueueWebhookMessage, type SecretsKeyRing } from "@coss/webhooks";
import { and, eq, gte, isNotNull, lt, ne, or, type SQL, sql } from "drizzle-orm";
import {
  ASSESSMENT_METER,
  type AssessmentBilling,
  NOT_BILLED,
  openAssessmentBilling,
  releaseAssessmentUnit,
} from "./billing.ts";
import type { IpIntelligenceSource } from "./datasets.ts";
import { readDeviceToken } from "./device.ts";
import type { DomainAgeLookup } from "./domain-age.ts";
import { RiskError } from "./errors.ts";
import type { RiskHasher, RiskHashKind } from "./hash.ts";
import { type ListMatch, matchListEntries } from "./lists.ts";
import {
  assessmentContentScores,
  type ContentScores,
  emailDeliverability,
  emailDomainAge,
  ipPrivacyFor,
  ipSignalsFor,
  isDisposable,
} from "./lookups.ts";
import { rememberUserNetwork, userNetworks } from "./networks.ts";
import type { PhoneLookup } from "./phone.ts";
import type { IpPrivacy, IpPrivacyLookup } from "./privacy.ts";
import { type RiskAssessmentRow, type StoredSignals, toRiskAssessmentObject } from "./read.ts";
import { firstMatchingRule, listRiskRuleRows, type RiskRuleRow, type RuleFacts } from "./rules.ts";
import { sandboxCaptchaVerdict, sandboxIpSignals } from "./sandbox.ts";
import {
  CONTENT_CATEGORIES,
  type CreateRiskAssessmentRequestOutput,
  NEW_DOMAIN_DAYS,
  type RiskAssessmentOutput,
  type RiskDegradedSignal,
  type StoredRiskWebhookEvent,
  VELOCITY_RULES,
  type VelocityDimension,
  velocityDimensionsFor,
  velocityGroup,
} from "./schemas.ts";
import { decide, type StoredReason, scoreReasons, sortReasons, toReasonObject } from "./score.ts";
import { captchaSecret, type ResolvedRiskSettings, resolveRiskSettings } from "./settings.ts";
import { takeTurns } from "./turns.ts";
import { type VelocityStore, velocityKey } from "./velocity.ts";

const { riskAssessment, riskIdentity, riskReport } = schema;

/** IP and subnet fraud reports only count this long; mailboxes and users until forgotten. */
export const NETWORK_REPORT_TTL_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_CAPTCHA_TIMEOUT_MS = 2000;

export type RiskDeps = {
  hash: RiskHasher;
  ipIntelligence: IpIntelligenceSource;
  /** `null`: no velocity (every assessment reports it as degraded). */
  velocity: VelocityStore | null;
  /** Namespaces velocity keys in Valkey (`RATE_LIMIT_KEY_PREFIX`). */
  keyPrefix: string;
  checkMailDomain: (domain: string) => Promise<MailDomainVerdict>;
  dnsTimeoutMs?: number;
  /** Registration dates (RDAP); `null`: no domain age (reported as degraded). */
  domainAge: DomainAgeLookup | null;
  domainAgeTimeoutMs?: number;
  /** Decrypts the environment's captcha secret (`WEBHOOK_SECRETS_KEY`). */
  secretsKeys: SecretsKeyRing;
  /** Defaults to the providers' `siteverify` (`@coss/signals/captcha`). */
  verifyCaptcha?: typeof verifyCaptcha;
  captchaTimeoutMs?: number;
  /** Scores `content` (Jev through the AI Gateway); `null`: content is reported as degraded. */
  classifier: ContentClassifier | null;
  classifyTimeoutMs?: number;
  /**
   * Charges an organization's classification budget (`risk.classify*` buckets) before a live
   * classification; `false` when it is spent. Without it, classification is unlimited.
   */
  chargeClassification?: (organizationId: string) => Promise<boolean>;
  /** Where customers' rate limit buckets live (`POST /v1/risk/limits`); `null`: unavailable. */
  limits: RateLimitStore | null;
  /** VPN, proxy and relay data per address (a paid provider); `null`: none (not degraded). */
  ipPrivacy?: IpPrivacyLookup | null;
  ipPrivacyTimeoutMs?: number;
  /** Line type, carrier and SIM swaps (a paid provider); `null`: phone checks are unavailable. */
  phoneLookup?: PhoneLookup | null;
  phoneLookupTimeoutMs?: number;
  /**
   * Caps metered usage on capped plans (Free's allowances): phone checks and content checks stop
   * there, assessments go on reduced (`./billing.ts`). Without it, nothing is capped.
   */
  usage?: UsageGate;
};

/** The authenticated environment (from the API key). */
export type RiskAssessEnvironment = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  mode: "live" | "sandbox";
};

export type AssessRiskInput = {
  environment: RiskAssessEnvironment;
  params: CreateRiskAssessmentRequestOutput;
  idempotencyKey?: string | null;
  apiKeyId?: string | null;
  /** The member a personal key belongs to (who the usage is attributed to). */
  userId?: string | null;
  /** A customer's API call, which is billed. Internal callers (Forms, sign-ups) aren't. */
  metered?: boolean;
  requestId?: string | null;
};

type Hashes = Partial<Record<RiskHashKind, string>>;

/** Collected signals, before adding mailbox duplicates and the decision. */
type Collected = {
  signals: StoredSignals;
  reasons: StoredReason[];
  degraded: RiskDegradedSignal[];
  email: EmailAnalysis | null;
  ip: string | null;
  hashes: Hashes;
  /** Facts rules can test that aren't in `signals` (whether or not their reason is disabled). */
  flags: { history: boolean; domainNew: boolean | null };
};

const IDEMPOTENCY_ERRORS = {
  inProgress: () =>
    new RiskError("request_in_progress", "This idempotency key is busy. Retry shortly."),
  reused: () =>
    new RiskError(
      "idempotency_key_reused",
      "This idempotency key was already used with a different request body.",
    ),
};

export async function assessRisk(
  deps: RiskDeps,
  input: AssessRiskInput,
): Promise<{ assessment: RiskAssessmentOutput; replayed: boolean }> {
  const { environment, params } = input;
  const idempotencyKey = input.idempotencyKey || null;
  const hash = idempotencyKey ? requestHash(params) : null;

  // A retry of a stored assessment is answered before asking a model to classify its content.
  if (idempotencyKey) {
    const existing = await assessmentByKey(db, environment, idempotencyKey);
    if (existing && isReplayOf(existing, hash)) {
      return { assessment: toRiskAssessmentObject(existing), replayed: true };
    }
    if (existing && Date.now() - existing.createdAt.getTime() <= IDEMPOTENCY_KEY_TTL_MS) {
      throw IDEMPOTENCY_ERRORS.reused();
    }
  }

  const billing =
    input.metered && environment.mode === "live"
      ? await openAssessmentBilling(deps, {
          organizationId: environment.organizationId,
          projectId: environment.projectId,
          apiKeyId: input.apiKeyId ?? null,
          userId: input.userId ?? null,
        })
      : NOT_BILLED;
  // Only a unit that was reserved and isn't owed goes back; never one a commit recorded.
  try {
    const result = await assessInTransaction(deps, input, billing, { idempotencyKey, hash });
    if (result.replayed || result.assessment.decision === "block") {
      await releaseAssessmentUnit(deps, environment.organizationId, billing);
    }
    return result;
  } catch (error) {
    await releaseAssessmentUnit(deps, environment.organizationId, billing);
    throw error;
  }
}

async function assessInTransaction(
  deps: RiskDeps,
  input: AssessRiskInput,
  billing: AssessmentBilling,
  key: { idempotencyKey: string | null; hash: string | null },
): Promise<{ assessment: RiskAssessmentOutput; replayed: boolean }> {
  const { environment, params } = input;
  const { idempotencyKey, hash } = key;
  // The dataset source can need its own database connection on first load, classification takes
  // up to 3 s and the privacy provider is a network call. Resolve them before occupying a
  // transaction connection, so concurrent requests cannot exhaust the pool.
  const ip = params.ip ? normalizeIp(params.ip) : null;
  const sandbox = environment.mode === "sandbox";
  const { reduced } = billing;
  const [ipSignals, privacy, content] = await Promise.all([
    ipSignalsFor(deps, ip, sandbox),
    reduced
      ? { privacy: null, degraded: Boolean(ip && deps.ipPrivacy) }
      : ipPrivacyFor(deps, ip, sandbox),
    reduced
      ? { scores: null, degraded: Boolean(params.content?.text) }
      : // Only paid work needs a claim: assessments without content stay one transaction.
        idempotencyKey && params.content?.text
        ? prepareIdempotentContent(deps, input, idempotencyKey, hash as string)
        : assessmentContentScores(deps, environment, params.content?.text),
  ]);
  return db.transaction(async (tx) => {
    if (idempotencyKey) {
      // Hold the key across collection and commit, including expired-key replacement.
      const lock = `risk:idempotency:${environment.environmentId}:${idempotencyKey}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
      const existing = await assessmentByKey(tx, environment, idempotencyKey);
      if (existing && isReplayOf(existing, hash)) {
        return { assessment: toRiskAssessmentObject(existing), replayed: true };
      }
      if (existing) {
        if (Date.now() - existing.createdAt.getTime() <= IDEMPOTENCY_KEY_TTL_MS) {
          throw IDEMPOTENCY_ERRORS.reused();
        }
        await tx
          .update(riskAssessment)
          .set({ idempotencyKey: null })
          .where(eq(riskAssessment.id, existing.id));
      }
    }
    // Use this connection for reads too: waiting retries may occupy the rest of the pool. It
    // runs one query at a time, so they go one after another (`./turns.ts`).
    const settings = await resolveRiskSettings(tx, environment);
    const rules = await listRiskRuleRows(tx, environment);
    const collected = await collectSignals(tx, deps, environment, params, settings, reduced, {
      ip: ipSignals,
      privacy,
      content,
    });
    const row = await insertAssessment(tx, input, collected, settings, rules, billing, {
      idempotencyKey,
      requestHash: hash,
    });
    if (!row) throw IDEMPOTENCY_ERRORS.inProgress();
    return { assessment: toRiskAssessmentObject(row), replayed: false };
  });
}

/** Reserve paid work in a short statement, without holding a connection during the model call.
 * Keep its result across failed assessment transactions too. A crashed preparer fails open after
 * 30 seconds; it is never replaced with another paid call during the key's 24-hour lifetime.
 */
async function prepareIdempotentContent(
  deps: RiskDeps,
  input: AssessRiskInput,
  key: string,
  hash: string,
): Promise<{ scores: ContentScores | null; degraded: boolean }> {
  const table = schema.riskAssessmentPreparation;
  const identity = and(
    eq(table.environmentId, input.environment.environmentId),
    eq(table.idempotencyKey, key),
  );
  const createdAt = new Date();
  const [claimed] = await db
    .insert(table)
    .values({
      environmentId: input.environment.environmentId,
      idempotencyKey: key,
      requestHash: hash,
      createdAt,
    })
    .onConflictDoUpdate({
      target: [table.environmentId, table.idempotencyKey],
      set: { requestHash: hash, createdAt, content: null },
      setWhere: lt(table.createdAt, new Date(Date.now() - IDEMPOTENCY_KEY_TTL_MS)),
    })
    .returning();
  if (claimed) {
    const content = await assessmentContentScores(
      deps,
      input.environment,
      input.params.content?.text,
    );
    await db
      .update(table)
      .set({ content })
      .where(and(identity, eq(table.createdAt, createdAt)));
    return content;
  }
  // Wait without occupying a pool connection; long-running requests answer the normal busy error.
  const deadline = Date.now() + 4000;
  do {
    const [prepared] = await db.select().from(table).where(identity);
    if (!prepared) throw IDEMPOTENCY_ERRORS.inProgress();
    if (prepared.requestHash !== hash) throw IDEMPOTENCY_ERRORS.reused();
    if (prepared.content) return prepared.content;
    if (Date.now() - prepared.createdAt.getTime() > 30_000) {
      return { scores: null, degraded: Boolean(input.params.content?.text) };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  throw IDEMPOTENCY_ERRORS.inProgress();
}

async function assessmentByKey(
  executor: Executor,
  environment: RiskAssessEnvironment,
  idempotencyKey: string,
): Promise<RiskAssessmentRow | undefined> {
  const [row] = await executor
    .select()
    .from(riskAssessment)
    .where(
      and(
        eq(riskAssessment.environmentId, environment.environmentId),
        eq(riskAssessment.organizationId, environment.organizationId),
        eq(riskAssessment.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row;
}

async function collectSignals(
  executor: Executor,
  deps: RiskDeps,
  environment: RiskAssessEnvironment,
  params: CreateRiskAssessmentRequestOutput,
  settings: ResolvedRiskSettings,
  reduced: boolean,
  resolved: {
    ip: Awaited<ReturnType<typeof ipSignalsFor>>;
    privacy: { privacy: IpPrivacy | null; degraded: boolean };
    content: { scores: ContentScores | null; degraded: boolean };
  },
): Promise<Collected> {
  const sandbox = environment.mode === "sandbox";
  const env = environment.environmentId;
  const reasons: StoredReason[] = [];
  const degraded = new Set<RiskDegradedSignal>(reduced ? ["usage_limit"] : []);

  const email = params.user?.email !== undefined ? analyzeEmail(params.user.email) : null;
  const ip = params.ip ? normalizeIp(params.ip) : null;
  const userId = params.user?.id ?? null;

  const hashes: Hashes = {};
  if (email?.valid) hashes.mailbox = deps.hash(env, "mailbox", email.canonical);
  if (ip) {
    hashes.ip = deps.hash(env, "ip", ip);
    const subnet = subnetOf(ip);
    if (subnet) hashes.subnet = deps.hash(env, "subnet", subnet);
  }
  if (userId) hashes.user = deps.hash(env, "user", userId);
  const device = params.device ? readDeviceToken(params.device.token, { sandbox }) : null;
  if (device?.id) hashes.device = deps.hash(env, "device", device.id);
  const cardFingerprint = params.checkout?.card?.fingerprint;
  if (cardFingerprint) hashes.card = deps.hash(env, "card", cardFingerprint);

  // The executor is the assessment's transaction: its reads take turns, the lookups outside the
  // database (DNS, RDAP, captcha, Valkey) run alongside them.
  const turns = takeTurns();
  const userHash = hashes.user;
  const [deliverability, age, captcha, ipSignals, velocity, listMatches, reports, networks] =
    await Promise.all([
      emailDeliverability(deps, email, sandbox),
      emailDomainAge(executor, deps, email, sandbox, turns),
      captchaVerdict(deps, settings, params, ip, sandbox),
      resolved.ip,
      reduced ? null : countVelocity(deps, environment, params, email, ip, hashes),
      turns(() =>
        matchListEntries(executor, environment, {
          mailbox: email?.valid ? email.canonical : null,
          domain: email?.valid ? email.domain : null,
          ip,
          asn: null,
          country: null,
          userId,
        }),
      ),
      reduced ? new Set<string>() : turns(() => reportedHashes(executor, environment, hashes)),
      // Logins compare the network with the user's earlier ones.
      !reduced && params.event === "login" && userHash
        ? turns(() => userNetworks(executor, environment, userHash))
        : null,
    ]);

  // Email.
  let emailSignals: StoredSignals["email"] = null;
  if (email) {
    const disposable = isDisposable(email, sandbox);
    if (deliverability === "unknown" && email.valid) degraded.add("email_dns");
    if (age.degraded) degraded.add("domain_age");
    emailSignals = {
      valid: email.valid,
      disposable,
      deliverability,
      role_account: email.role,
      free_provider: email.free,
      suggestion: email.suggestion,
      domain_age_days: age.days,
    };
    if (!email.valid) reasons.push({ code: "email.invalid" });
    if (disposable) reasons.push({ code: "email.disposable" });
    if (deliverability === "undeliverable") reasons.push({ code: "email.undeliverable" });
    if (email.role) reasons.push({ code: "email.role_account" });
    if (email.suggestion) reasons.push({ code: "email.typo", suggestion: email.suggestion });
    if (age.days !== null && age.days < NEW_DOMAIN_DAYS) reasons.push({ code: "email.domain_new" });
  }

  // Captcha.
  let captchaSignals: StoredSignals["captcha"] = null;
  if (params.captcha) {
    if (captcha.degraded) degraded.add("captcha");
    captchaSignals = { provided: true, passed: captcha.passed };
    if (captcha.passed === false) reasons.push({ code: "captcha.failed" });
  } else if (settings.captcha?.required) {
    captchaSignals = { provided: false, passed: null };
    reasons.push({ code: "captcha.missing" });
  }

  // Content: scores only, and reasons only at the thresholds the customer set.
  if (resolved.content.degraded) degraded.add("content");
  const contentScores = resolved.content.scores;
  if (contentScores) {
    for (const category of CONTENT_CATEGORIES) {
      const threshold = settings.contentThresholds[category];
      const value = contentScores[category];
      if (threshold !== undefined && value >= threshold) {
        reasons.push({ code: `content.${category}`, value, threshold });
      }
    }
  }

  // IP: the datasets know networks, the privacy provider (when there is one) knows addresses.
  let ipObject: StoredSignals["ip"] = null;
  if (ip) {
    if (ipSignals.degraded) degraded.add("ip_data");
    if (resolved.privacy.degraded) degraded.add("ip_privacy");
    const privacy = resolved.privacy.privacy;
    const found = ipSignals.signals;
    if (found) {
      ipObject = {
        version: found.version,
        private: found.bogon,
        tor: found.tor,
        hosting: found.hosting,
        hosting_provider: found.hosting_provider,
        hosting_kind: found.hosting_kind,
        asn: found.asn,
        as_name: found.as_name,
        country: found.country,
        privacy,
      };
      if (found.bogon) reasons.push({ code: "ip.private" });
      if (found.tor) reasons.push({ code: "ip.tor" });
      if (privacy?.vpn) {
        reasons.push(
          privacy.service ? { code: "ip.vpn", provider: privacy.service } : { code: "ip.vpn" },
        );
      } else if (found.hosting_kind === "vpn" && !privacy) {
        // Only a guess from the network: the provider, when there is one, knows the address.
        reasons.push({ code: "ip.vpn_network", provider: found.hosting_provider ?? "unknown" });
      } else if (found.hosting) {
        reasons.push({
          code: "ip.hosting_provider",
          provider: found.hosting_provider ?? "unknown",
        });
      }
      if (privacy?.proxy) reasons.push({ code: "ip.proxy" });
      if (privacy?.relay) reasons.push({ code: "ip.relay" });
    }
  }

  // Checkout: what the customer's payment processor knows about the card, against the IP.
  let checkoutSignals: StoredSignals["checkout"] = null;
  if (params.checkout) {
    const { checkout } = params;
    checkoutSignals = {
      amount: checkout.amount,
      currency: checkout.currency,
      card_country: checkout.card?.country ?? null,
      card_funding: checkout.card?.funding ?? null,
      billing_country: checkout.billing_country ?? null,
      shipping_country: checkout.shipping_country ?? null,
    };
    const cardCountry = checkoutSignals.card_country;
    const ipCountry = ipObject?.country ?? null;
    if (cardCountry && ipCountry && !ipObject?.private && cardCountry !== ipCountry) {
      reasons.push({ code: "checkout.card_country_mismatch" });
    }
    if (
      cardCountry &&
      checkoutSignals.billing_country &&
      cardCountry !== checkoutSignals.billing_country
    ) {
      reasons.push({ code: "checkout.billing_country_mismatch" });
    }
    if (checkoutSignals.card_funding === "prepaid") reasons.push({ code: "checkout.prepaid_card" });
  }

  // Device.
  if (device) {
    if (!device.signals.valid) reasons.push({ code: "device.invalid" });
    if (device.signals.automation) reasons.push({ code: "device.automation" });
  }

  // Lists can also match on the IP's network and country, known only now.
  const networkMatches =
    ipObject && (ipObject.asn || ipObject.country)
      ? await matchListEntries(executor, environment, {
          asn: ipObject.asn,
          country: ipObject.country,
        })
      : [];
  for (const match of dedupeMatches([...listMatches, ...networkMatches])) {
    reasons.push({
      code: match.list === "allow" ? "list.allowed" : "list.blocked",
      entry: match.id,
      type: match.type,
    });
  }

  // Velocity.
  if (velocity === null) degraded.add("velocity");
  else {
    const group = velocityGroup(params.event);
    for (const rule of VELOCITY_RULES) {
      if (rule.events !== group) continue;
      const value = velocity[`${rule.dimension}_${rule.window}`];
      if (value !== undefined && value >= rule.threshold) {
        reasons.push({
          code: rule.code as StoredReason["code"],
          value,
          threshold: rule.threshold,
          window: rule.window,
        });
      }
    }
  }

  // Login networks: only users with history have something to compare with.
  let loginSignals: StoredSignals["login"] = null;
  if (networks && ipObject && (networks.countries.size > 0 || networks.asns.size > 0)) {
    const newCountry =
      networks.countries.size > 0 &&
      ipObject.country !== null &&
      !networks.countries.has(ipObject.country);
    const newNetwork =
      networks.asns.size > 0 && ipObject.asn !== null && !networks.asns.has(String(ipObject.asn));
    loginSignals = { new_country: newCountry, new_network: newNetwork };
    if (newCountry) reasons.push({ code: "login.new_country" });
    if (newNetwork) reasons.push({ code: "login.new_network" });
  }

  // Memory.
  if (reports.has("mailbox")) reasons.push({ code: "history.fraud_mailbox" });
  if (reports.has("user")) reasons.push({ code: "history.fraud_user" });
  if (reports.has("card")) reasons.push({ code: "history.fraud_card" });
  if (reports.has("device")) reasons.push({ code: "history.fraud_device" });
  if (reports.has("ip")) reasons.push({ code: "history.fraud_ip" });
  else if (reports.has("subnet")) reasons.push({ code: "history.fraud_subnet" });

  return {
    signals: {
      email: emailSignals,
      ip: ipObject,
      velocity,
      captcha: captchaSignals,
      login: loginSignals,
      content: contentScores,
      checkout: checkoutSignals,
      device: device?.signals ?? null,
    },
    reasons,
    degraded: [...degraded].sort(),
    email,
    ip,
    hashes,
    flags: {
      history: reports.size > 0,
      domainNew: age.days === null ? null : age.days < NEW_DOMAIN_DAYS,
    },
  };
}

/** `passed: null` when the token couldn't be checked; `degraded` when the provider failed. */
async function captchaVerdict(
  deps: RiskDeps,
  settings: ResolvedRiskSettings,
  params: CreateRiskAssessmentRequestOutput,
  ip: string | null,
  sandbox: boolean,
): Promise<{ passed: boolean | null; degraded: boolean }> {
  const token = params.captcha?.token;
  if (!token) return { passed: null, degraded: false };
  const fixture = sandbox ? sandboxCaptchaVerdict(token) : null;
  if (fixture !== null) return { passed: fixture, degraded: false };
  if (!settings.captcha) return { passed: null, degraded: false };
  const verify = deps.verifyCaptcha ?? verifyCaptcha;
  const timeoutMs = deps.captchaTimeoutMs ?? DEFAULT_CAPTCHA_TIMEOUT_MS;
  try {
    const verdict: CaptchaVerdict = await verify({
      provider: settings.captcha.provider,
      secret: captchaSecret(settings, deps.secretsKeys) ?? "",
      token,
      remoteIp: ip && !isBlockedAddress(ip) ? ip : null,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { passed: verdict.success, degraded: false };
  } catch (error) {
    console.warn(
      "[risk] Captcha verification failed:",
      error instanceof Error ? error.message : error,
    );
    return { passed: null, degraded: true };
  }
}

function dedupeMatches(matches: ListMatch[]): ListMatch[] {
  return [...new Map(matches.map((match) => [match.id, match])).values()];
}

/** Counts this event; `null` when velocity is unavailable. Keys are `<dimension>_<window>`. */
async function countVelocity(
  deps: RiskDeps,
  environment: RiskAssessEnvironment,
  params: CreateRiskAssessmentRequestOutput,
  email: EmailAnalysis | null,
  ip: string | null,
  hashes: Hashes,
): Promise<Record<string, number> | null> {
  if (!deps.velocity) return null;
  const env = environment.environmentId;
  // Private addresses are the integration's proxy, shared by every event: never count them
  // (a sandbox's documentation addresses stand for public ones).
  const sandbox = environment.mode === "sandbox";
  const publicIp =
    ip !== null && ((sandbox && sandboxIpSignals(ip) !== null) || !isBlockedAddress(ip));
  const values: Partial<Record<VelocityDimension, string>> = {
    ip: publicIp ? hashes.ip : undefined,
    subnet: publicIp ? hashes.subnet : undefined,
    mailbox: hashes.mailbox,
    user: hashes.user,
    card: hashes.card,
    device: hashes.device,
    email_domain:
      email?.valid && !email.free ? deps.hash(env, "email_domain", email.domain) : undefined,
  };
  const eventKey = params.event === "custom" ? `custom.${params.event_name}` : params.event;
  const dimensions = velocityDimensionsFor(params.event).filter((d) => values[d]);
  if (dimensions.length === 0) return {};
  try {
    const counts = await deps.velocity.increment(
      dimensions.map((d) => velocityKey(deps.keyPrefix, eventKey, d, values[d] as string)),
    );
    const result: Record<string, number> = {};
    dimensions.forEach((dimension, index) => {
      const count = counts[index];
      if (!count) return;
      result[`${dimension}_1h`] = count["1h"];
      result[`${dimension}_24h`] = count["24h"];
    });
    return result;
  } catch (error) {
    console.warn("[risk] Velocity is unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Which of the hashes were reported as fraud or abuse (networks only for 30 days). */
async function reportedHashes(
  executor: Executor,
  environment: RiskAssessEnvironment,
  hashes: Hashes,
): Promise<Set<string>> {
  const pairs: SQL[] = [];
  const networkCutoff = new Date(Date.now() - NETWORK_REPORT_TTL_MS);
  for (const kind of ["mailbox", "user", "card", "device", "ip", "subnet"] as const) {
    const value = hashes[kind];
    if (!value) continue;
    const network = kind === "ip" || kind === "subnet";
    pairs.push(
      and(
        eq(riskReport.kind, kind),
        eq(riskReport.valueHash, value),
        network ? gte(riskReport.reportedAt, networkCutoff) : undefined,
      ) as SQL,
    );
  }
  if (pairs.length === 0) return new Set();
  const rows = await executor
    .select({ kind: riskReport.kind })
    .from(riskReport)
    .where(
      and(
        eq(riskReport.organizationId, environment.organizationId),
        eq(riskReport.environmentId, environment.environmentId),
        or(...pairs),
      ),
    );
  return new Set(rows.map((row) => row.kind));
}

async function insertAssessment(
  tx: Transaction,
  input: AssessRiskInput,
  collected: Collected,
  settings: ResolvedRiskSettings,
  rules: readonly RiskRuleRow[],
  billing: AssessmentBilling,
  key: { idempotencyKey: string | null; requestHash: string | null },
): Promise<RiskAssessmentRow | undefined> {
  const { environment, params } = input;
  const userId = params.user?.id ?? null;
  const mailboxHash = collected.hashes.mailbox;
  const deviceHash = collected.hashes.device;
  const reasons = [...collected.reasons];

  // "This mailbox (or browser) already has an account": serialized per mailbox and per device
  // (always in that order), so of two concurrent sign-ups the second sees the first.
  // A reduced assessment doesn't read memory, but what it sees still goes in below.
  const signup = params.event === "signup";
  const comparesAccounts = signup && !billing.reduced;
  const previousMailbox =
    comparesAccounts && mailboxHash
      ? await previousAccount(tx, environment, "mailbox", mailboxHash, userId)
      : undefined;
  if (previousMailbox) {
    reasons.push({
      code: "duplicate.canonical_mailbox",
      previous_user: previousMailbox.userId,
      previous_assessment: previousMailbox.assessmentId,
    });
  }
  const previousDevice =
    comparesAccounts && deviceHash
      ? await previousAccount(tx, environment, "device", deviceHash, userId)
      : undefined;
  if (previousDevice) {
    reasons.push({
      code: "duplicate.device",
      previous_user: previousDevice.userId,
      previous_assessment: previousDevice.assessmentId,
    });
  }

  // Disabled reasons never fire; rules still see the facts behind them.
  const weights = settings.reasonWeights;
  const enabled = reasons.filter((reason) => !settings.disabledReasons.has(reason.code));
  const score = scoreReasons(enabled, weights);
  const listed = enabled.some((reason) => reason.code.startsWith("list."));
  const rule = listed
    ? null
    : firstMatchingRule(
        rules,
        params.event,
        ruleFacts(collected, {
          score,
          duplicate: previousMailbox !== undefined,
          duplicateDevice: previousDevice !== undefined,
        }),
      );
  if (rule) enabled.push({ code: "rule.matched", rule: rule.id, name: rule.name });
  const sorted = sortReasons(enabled, weights);
  const decision = decide(score, sorted, settings.thresholds, rule?.action ?? null);
  const now = new Date();

  const [row] = await tx
    .insert(riskAssessment)
    .values({
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      environmentId: environment.environmentId,
      event: params.event,
      eventName: params.event_name ?? null,
      userId,
      email: collected.email?.address ?? null,
      ip: collected.ip,
      userAgent: params.user_agent ?? null,
      emailHash: collected.hashes.mailbox ?? null,
      ipHash: collected.hashes.ip ?? null,
      subnetHash: collected.hashes.subnet ?? null,
      cardHash: collected.hashes.card ?? null,
      deviceHash: deviceHash ?? null,
      decision,
      score,
      reasons: sorted,
      signals: collected.signals,
      degraded: collected.degraded,
      reviewStatus: decision === "review" ? "open" : null,
      idempotencyKey: key.idempotencyKey,
      requestHash: key.requestHash,
      createdAt: now,
    })
    .onConflictDoNothing({ target: [riskAssessment.environmentId, riskAssessment.idempotencyKey] })
    .returning();
  if (!row) return undefined;

  // Blocked traffic is free: an attack mustn't use up an allowance or inflate a bill.
  if (billing.billable && decision !== "block") {
    await recordUsage(tx, {
      organizationId: environment.organizationId,
      environmentId: environment.environmentId,
      projectId: environment.projectId,
      apiKeyId: input.apiKeyId ?? null,
      userId: input.userId ?? null,
      meter: ASSESSMENT_METER,
      quantity: 1,
    });
  }

  if (signup && decision !== "block") {
    const identities = [
      { kind: "mailbox" as const, valueHash: mailboxHash },
      { kind: "device" as const, valueHash: deviceHash },
    ].filter((identity): identity is { kind: "mailbox" | "device"; valueHash: string } =>
      Boolean(identity.valueHash),
    );
    if (identities.length > 0) {
      await tx
        .insert(riskIdentity)
        .values(
          identities.map((identity) => ({
            organizationId: environment.organizationId,
            environmentId: environment.environmentId,
            kind: identity.kind,
            valueHash: identity.valueHash,
            userId,
            assessmentId: row.id,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [
            riskIdentity.environmentId,
            riskIdentity.kind,
            riskIdentity.valueHash,
            riskIdentity.userId,
          ],
          // `assessment_id` stays the first assessment that saw this user with the identity.
          set: { lastSeenAt: now },
        });
    }
  }

  // Where users sign up and log in from, for `login.new_*` on later logins.
  const network = collected.signals.ip;
  if (
    (params.event === "signup" || params.event === "login") &&
    collected.hashes.user &&
    network &&
    !network.private &&
    decision !== "block"
  ) {
    await rememberUserNetwork(tx, environment, collected.hashes.user, network, now);
  }

  const label = params.event === "custom" ? (params.event_name ?? "custom") : params.event;
  await appendLogEntries(tx, [
    {
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      environmentId: environment.environmentId,
      occurredAt: now,
      source: "risk",
      level: decision === "allow" ? "info" : "warning",
      type: "risk.assessment",
      message: `${label} assessed: ${decision} (score ${Math.round(score * 100) / 100})`,
      requestId: input.requestId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      resourceType: "risk_assessment",
      resourceId: row.id,
      attributes: {
        event: params.event,
        decision,
        score,
        reasons: sorted.map((reason) => reason.code),
      },
      searchTerms: [decision, ...sorted.map((reason) => reason.code)],
    },
  ]);

  if (decision === "review") {
    const id = newId(ID_PREFIXES.webhookEvent);
    const payload: StoredRiskWebhookEvent = {
      id,
      object: "event",
      type: "risk.assessment.review",
      created_at: now.toISOString(),
      data: {
        assessment_id: row.id,
        event: params.event,
        event_name: params.event_name ?? null,
        decision,
        score,
        reasons: sorted.map(toReasonObject),
        user_id: userId,
        outcome: null,
        occurred_at: now.toISOString(),
      },
    };
    await enqueueWebhookMessage(tx, {
      id,
      organizationId: environment.organizationId,
      environmentId: environment.environmentId,
      type: payload.type,
      payload,
      now,
    });
    // Sandbox environments are for testing integrations; nobody needs to be woken up for them.
    if (environment.mode === "live") {
      await enqueuePush(tx, {
        organizationId: environment.organizationId,
        environmentId: environment.environmentId,
        kind: "risk_review",
        subjectId: environment.environmentId,
        collapseKey: `risk_review:${environment.environmentId}`,
        now,
      });
    }
  }
  return row;
}

/**
 * The first account (a user id) another user signed up with this mailbox or device, after taking
 * the identity's advisory lock (held until the transaction ends).
 */
async function previousAccount(
  tx: Transaction,
  environment: RiskAssessEnvironment,
  kind: "mailbox" | "device",
  valueHash: string,
  userId: string | null,
): Promise<{ userId: string | null; assessmentId: string } | undefined> {
  const lock = `risk:${kind}:${environment.environmentId}:${valueHash}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
  const [previous] = await tx
    .select({ userId: riskIdentity.userId, assessmentId: riskIdentity.assessmentId })
    .from(riskIdentity)
    .where(
      and(
        eq(riskIdentity.organizationId, environment.organizationId),
        eq(riskIdentity.environmentId, environment.environmentId),
        eq(riskIdentity.kind, kind),
        eq(riskIdentity.valueHash, valueHash),
        // Only accounts count: earlier attempts without a user are velocity, not duplicates.
        isNotNull(riskIdentity.userId),
        userId ? ne(riskIdentity.userId, userId) : undefined,
      ),
    )
    .orderBy(riskIdentity.firstSeenAt)
    .limit(1);
  return previous;
}

/** The values rules test (`RULE_FIELDS`), from the collected signals. */
function ruleFacts(
  collected: Collected,
  extra: { score: number; duplicate: boolean; duplicateDevice: boolean },
): RuleFacts {
  const { email, ip, velocity, captcha, login, content, checkout, device } = collected.signals;
  const v = (key: string) => velocity?.[key] ?? null;
  return {
    "email.valid": email ? email.valid : null,
    "email.disposable": email ? email.disposable : null,
    "email.undeliverable": email ? email.deliverability === "undeliverable" : null,
    "email.role_account": email ? email.role_account : null,
    "email.free_provider": email ? email.free_provider : null,
    "email.typo": email ? email.suggestion !== null : null,
    "email.domain_new": collected.flags.domainNew,
    "email.domain": collected.email?.valid ? collected.email.domain : null,
    "email.domain_age_days": email?.domain_age_days ?? null,
    "ip.tor": ip ? ip.tor : null,
    "ip.hosting": ip ? ip.hosting : null,
    // The provider's answer when there is one, else the network's reputation.
    "ip.vpn": ip ? (ip.privacy ? ip.privacy.vpn : ip.hosting_kind === "vpn") : null,
    "ip.proxy": ip?.privacy ? ip.privacy.proxy : null,
    "ip.relay": ip?.privacy ? ip.privacy.relay : null,
    "ip.private": ip ? ip.private : null,
    "ip.country": ip?.country ?? null,
    "ip.asn": ip?.asn ? String(ip.asn) : null,
    "ip.hosting_provider": ip?.hosting_provider ?? null,
    "captcha.passed": captcha ? captcha.passed : null,
    "duplicate.canonical_mailbox": collected.email?.valid ? extra.duplicate : null,
    "duplicate.device": collected.hashes.device ? extra.duplicateDevice : null,
    "history.fraud": collected.flags.history,
    "login.new_country": login ? login.new_country : null,
    "login.new_network": login ? login.new_network : null,
    "content.spam": content?.spam ?? null,
    "content.phishing": content?.phishing ?? null,
    "content.malware": content?.malware ?? null,
    "content.fraud": content?.fraud ?? null,
    "checkout.amount": checkout?.amount ?? null,
    "checkout.currency": checkout?.currency ?? null,
    "checkout.card_country": checkout?.card_country ?? null,
    "checkout.card_funding": checkout?.card_funding ?? null,
    "checkout.billing_country": checkout?.billing_country ?? null,
    "checkout.shipping_country": checkout?.shipping_country ?? null,
    "device.automation": device?.valid ? device.automation : null,
    "device.timezone": device?.timezone ?? null,
    "device.language": device?.language ?? null,
    score: extra.score,
    "velocity.ip_1h": v("ip_1h"),
    "velocity.ip_24h": v("ip_24h"),
    "velocity.subnet_1h": v("subnet_1h"),
    "velocity.subnet_24h": v("subnet_24h"),
    "velocity.email_domain_1h": v("email_domain_1h"),
    "velocity.email_domain_24h": v("email_domain_24h"),
    "velocity.mailbox_1h": v("mailbox_1h"),
    "velocity.mailbox_24h": v("mailbox_24h"),
    "velocity.user_1h": v("user_1h"),
    "velocity.user_24h": v("user_24h"),
    "velocity.card_1h": v("card_1h"),
    "velocity.card_24h": v("card_24h"),
    "velocity.device_1h": v("device_1h"),
    "velocity.device_24h": v("device_24h"),
  };
}
