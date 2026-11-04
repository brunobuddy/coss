/**
 * The signals behind assessments, also offered alone as building blocks (`POST
 * /v1/risk/email/check`, `/ip/check`, `/content/classify`): stateless lookups that store and count
 * nothing about the person looked up. Each one is best-effort and bounded in time, except
 * classification, which a caller asked for explicitly and is told about when it fails.
 */
import { isOnBillingHold, recordUsage } from "@coss/billing/metering";
import { HipaaModeError, hipaaVendorCovered, isHipaaMode } from "@coss/compliance";
import { db, type Executor } from "@coss/db";
import type { ContentClassifier } from "@coss/screening/classifier";
import { MAX_TEXT_CHARS, prepareLinks, prepareText, urlsInText } from "@coss/screening/text";
import { analyzeEmail, type EmailAnalysis, type MailDomainVerdict } from "@coss/signals/email";
import {
  createIpIntelligence,
  type IpSignals,
  isBlockedAddress,
  normalizeIp,
} from "@coss/signals/ip";
import type { RiskDeps } from "./assess.ts";
import { domainAge } from "./domain-age.ts";
import { RiskError } from "./errors.ts";
import { normalizePhone, type PhoneData } from "./phone.ts";
import type { IpPrivacy } from "./privacy.ts";
import {
  SANDBOX_DISPOSABLE_DOMAIN,
  sandboxContentScores,
  sandboxDomainAgeDays,
  sandboxIpPrivacy,
  sandboxIpSignals,
  sandboxMailDomainVerdict,
  sandboxPhoneData,
} from "./sandbox.ts";
import {
  CONTENT_CATEGORIES,
  type ContentCategory,
  type RiskContentClassificationOutput,
  type RiskEmailCheckOutput,
  type RiskIpCheckOutput,
  type RiskPhoneCheckOutput,
} from "./schemas.ts";
import type { Turns } from "./turns.ts";

const DEFAULT_DNS_TIMEOUT_MS = 800;
const DEFAULT_DOMAIN_AGE_TIMEOUT_MS = 1000;
const DEFAULT_IP_PRIVACY_TIMEOUT_MS = 500;
const DEFAULT_PHONE_LOOKUP_TIMEOUT_MS = 2000;
/** Classification asks a model: at most this long, then the caller goes without it. */
export const DEFAULT_CLASSIFY_TIMEOUT_MS = 3000;

/** What a lookup needs to know about the caller's environment. */
export type LookupEnvironment = { organizationId: string; mode: "live" | "sandbox" };

/** Phone checks are billed: who the usage comes from, as `recordUsage` attributes it. */
export type PhoneCheckEnvironment = LookupEnvironment & {
  environmentId: string;
  projectId: string;
  apiKeyId: string | null;
  /** The member a personal key belongs to. */
  userId: string | null;
};

const PHONE_METER = "risk.phone_checks";

/** Resolves to `fallback` when `promise` takes longer than `ms` (the promise keeps running). */
export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Disposable, counting the sandbox's `@disposable.test`. */
export function isDisposable(email: EmailAnalysis, sandbox: boolean): boolean {
  return email.disposable || (sandbox && email.valid && email.domain === SANDBOX_DISPOSABLE_DOMAIN);
}

export async function emailDeliverability(
  deps: RiskDeps,
  email: EmailAnalysis | null,
  sandbox: boolean,
): Promise<MailDomainVerdict> {
  if (!email?.valid) return "unknown";
  const fixture = sandbox ? sandboxMailDomainVerdict(email.domain) : null;
  if (fixture) return fixture;
  try {
    return await within(
      deps.checkMailDomain(email.domain),
      deps.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS,
      "unknown",
    );
  } catch {
    return "unknown";
  }
}

/** Domain age, looked up only for organizations' own domains (not free or disposable ones). */
export async function emailDomainAge(
  executor: Executor,
  deps: RiskDeps,
  email: EmailAnalysis | null,
  sandbox: boolean,
  turns?: Turns,
): Promise<{ days: number | null; degraded: boolean }> {
  if (!email?.valid || email.free || isDisposable(email, sandbox)) {
    return { days: null, degraded: false };
  }
  if (sandbox && (email.domain === "test" || email.domain.endsWith(".test"))) {
    return { days: sandboxDomainAgeDays(email.domain), degraded: false };
  }
  if (!deps.domainAge) return { days: null, degraded: true };
  return domainAge(executor, deps.domainAge, email.domain, {
    timeoutMs: deps.domainAgeTimeoutMs ?? DEFAULT_DOMAIN_AGE_TIMEOUT_MS,
    turns,
  });
}

export async function ipSignalsFor(
  deps: RiskDeps,
  ip: string | null,
  sandbox: boolean,
): Promise<{ signals: IpSignals | null; degraded: boolean }> {
  if (!ip) return { signals: null, degraded: false };
  const fixture = sandbox ? sandboxIpSignals(ip) : null;
  if (fixture) return { signals: fixture, degraded: false };
  try {
    const intelligence = await deps.ipIntelligence.current();
    const { tor, cloud, asn } = intelligence.available;
    return { signals: intelligence.lookup(ip), degraded: !(tor && cloud && asn) };
  } catch {
    // Local address facts survive a dataset outage, as do independent privacy results.
    return { signals: createIpIntelligence({}).lookup(ip), degraded: true };
  }
}

/**
 * VPN, proxy and relay data for a public address: `null` without a provider (not degraded), or
 * when the provider failed or took longer than its budget (degraded). Sandbox environments only
 * get the fixtures: the provider is paid per lookup, and sandbox keys are free.
 */
export async function ipPrivacyFor(
  deps: RiskDeps,
  ip: string | null,
  sandbox: boolean,
): Promise<{ privacy: IpPrivacy | null; degraded: boolean }> {
  if (!ip) return { privacy: null, degraded: false };
  if (sandbox) return { privacy: sandboxIpPrivacy(ip), degraded: false };
  if (!deps.ipPrivacy || isBlockedAddress(ip)) return { privacy: null, degraded: false };
  const timeoutMs = deps.ipPrivacyTimeoutMs ?? DEFAULT_IP_PRIVACY_TIMEOUT_MS;
  try {
    return { privacy: await deps.ipPrivacy(ip, AbortSignal.timeout(timeoutMs)), degraded: false };
  } catch (error) {
    console.warn("[risk] IP privacy lookup failed:", error instanceof Error ? error.name : "error");
    return { privacy: null, degraded: true };
  }
}

/** `POST /v1/risk/email/check`. */
export async function checkEmail(
  deps: RiskDeps,
  environment: LookupEnvironment,
  address: string,
): Promise<RiskEmailCheckOutput> {
  const sandbox = environment.mode === "sandbox";
  const email = analyzeEmail(address);
  const [deliverability, age] = await Promise.all([
    emailDeliverability(deps, email, sandbox),
    emailDomainAge(db, deps, email, sandbox),
  ]);
  const degraded: RiskEmailCheckOutput["degraded"] = [];
  if (email.valid && deliverability === "unknown") degraded.push("email_dns");
  if (age.degraded) degraded.push("domain_age");
  return {
    object: "risk_email_check",
    email: address,
    valid: email.valid,
    domain: email.valid ? email.domain : null,
    canonical: email.valid ? email.canonical : null,
    disposable: isDisposable(email, sandbox),
    deliverability,
    role_account: email.role,
    free_provider: email.free,
    suggestion: email.suggestion,
    domain_age_days: age.days,
    degraded,
  };
}

/** `POST /v1/risk/ip/check`. */
export async function checkIp(
  deps: RiskDeps,
  environment: LookupEnvironment,
  address: string,
): Promise<RiskIpCheckOutput> {
  const ip = normalizeIp(address) ?? address;
  const sandbox = environment.mode === "sandbox";
  const [{ signals, degraded }, privacy] = await Promise.all([
    ipSignalsFor(deps, ip, sandbox),
    ipPrivacyFor(deps, ip, sandbox),
  ]);
  const missing: RiskIpCheckOutput["degraded"] = [];
  if (degraded) missing.push("ip_data");
  if (privacy.degraded) missing.push("ip_privacy");
  return {
    object: "risk_ip_check",
    ip,
    version: signals?.version ?? (ip.includes(":") ? 6 : 4),
    private: signals?.bogon ?? false,
    tor: signals?.tor ?? false,
    hosting: signals?.hosting ?? false,
    hosting_provider: signals?.hosting_provider ?? null,
    hosting_kind: signals?.hosting_kind ?? null,
    asn: signals?.asn ?? null,
    as_name: signals?.as_name ?? null,
    country: signals?.country ?? null,
    privacy: privacy.privacy,
    degraded: missing,
  };
}

/**
 * `POST /v1/risk/phone/check`. Sandbox environments only get the fixtures (the provider is paid
 * per lookup, and sandbox keys are free); numbers that aren't E.164 are never sent. Throws
 * `RiskError("phone_lookup_unavailable")` when live environments have no provider.
 *
 * Live checks are metered (`risk.phone_checks`) when the provider answered about the number:
 * the plan's cap is reserved before asking (`BillingError("usage_limit_exceeded")` beyond it, so
 * a capped plan never costs a lookup it can't bill) and given back when the lookup fails.
 */
export async function checkPhone(
  deps: RiskDeps,
  environment: PhoneCheckEnvironment,
  input: string,
): Promise<RiskPhoneCheckOutput> {
  const phone = normalizePhone(input);
  const unknown: RiskPhoneCheckOutput = {
    object: "risk_phone_check",
    phone: phone ?? input,
    valid: phone !== null,
    country: null,
    line_type: null,
    carrier: null,
    sim_swap: null,
    degraded: [],
  };
  if (!phone) return unknown;
  if (environment.mode === "sandbox") {
    const fixture = sandboxPhoneData(phone);
    return fixture ? phoneCheck(phone, fixture) : unknown;
  }
  if (!hipaaVendorCovered("twilio_lookup") && (await isHipaaMode(environment.organizationId))) {
    throw new HipaaModeError(
      "Phone checks aren't available in HIPAA mode: they would send the number to a provider outside your BAA.",
    );
  }
  if (!deps.phoneLookup) {
    throw new RiskError(
      "phone_lookup_unavailable",
      "Phone checks aren't available at the moment. Retry later.",
    );
  }
  const { organizationId } = environment;
  if (await isOnBillingHold(organizationId)) {
    throw new RiskError(
      "billing_hold",
      "Live phone checks are paused for this organization: an invoice is overdue or its spend or " +
        "credit limit was reached. Sandbox keys still work. See the organization's billing settings.",
    );
  }
  const usage = { organizationId, meter: PHONE_METER, quantity: 1 } as const;
  const gate = deps.usage;
  // A release goes back to the month the reservation was made in, even after midnight.
  const reservedAt = new Date();
  if (gate) await db.transaction((tx) => gate.reserve(tx, usage));
  const timeoutMs = deps.phoneLookupTimeoutMs ?? DEFAULT_PHONE_LOOKUP_TIMEOUT_MS;
  let data: PhoneData | null = null;
  try {
    data = await deps.phoneLookup(phone, AbortSignal.timeout(timeoutMs));
  } catch (error) {
    // Never the number: only that the provider failed.
    console.warn("[risk] Phone lookup failed:", error instanceof Error ? error.name : "error");
  }
  if (!data || data.missing.includes("line_type")) {
    // Nothing to bill for: the reservation goes back.
    if (gate?.release) {
      const release = gate.release.bind(gate);
      await db.transaction((tx) => release(tx, { ...usage, reservedAt }));
    }
    return data ? phoneCheck(phone, data) : { ...unknown, degraded: ["phone_data"] };
  }
  // Counter and attribution commit together, in one hour.
  await db.transaction((tx) =>
    recordUsage(tx, {
      ...usage,
      environmentId: environment.environmentId,
      projectId: environment.projectId,
      apiKeyId: environment.apiKeyId,
      userId: environment.userId,
    }),
  );
  return phoneCheck(phone, data);
}

function phoneCheck(phone: string, data: PhoneData): RiskPhoneCheckOutput {
  return {
    object: "risk_phone_check",
    phone,
    valid: data.valid,
    country: data.country,
    line_type: data.lineType,
    carrier: data.carrier && {
      name: data.carrier.name,
      mobile_country_code: data.carrier.mobileCountryCode,
      mobile_network_code: data.carrier.mobileNetworkCode,
    },
    sim_swap: data.simSwap && {
      recent: data.simSwap.recent,
      swapped_at: data.simSwap.swappedAt,
      period: data.simSwap.period,
    },
    degraded: data.missing.map((part) => (part === "line_type" ? "phone_data" : "sim_swap")),
  };
}

export type ContentScores = Record<ContentCategory, number>;

/**
 * Scores text with the classifier (sandbox environments: the `[coss-test:…]` markers). Throws
 * `RiskError("classification_unavailable")` when there is no classifier, or it failed or took
 * longer than the timeout. Neither the text nor the scores are kept.
 */
export async function classifyContent(
  deps: RiskDeps,
  environment: LookupEnvironment,
  text: string,
): Promise<RiskContentClassificationOutput> {
  const truncated = text.length > MAX_TEXT_CHARS;
  if (environment.mode === "sandbox") {
    return { object: "risk_content_classification", scores: sandboxContentScores(text), truncated };
  }
  if (await isHipaaMode(environment.organizationId)) {
    throw new HipaaModeError(
      "Content classification isn't available in HIPAA mode: it would send the text to an AI model.",
    );
  }
  const scores = await modelScores(deps.classifier, text, deps.classifyTimeoutMs);
  return { object: "risk_content_classification", scores, truncated };
}

async function modelScores(
  classifier: ContentClassifier | null,
  text: string,
  timeoutMs = DEFAULT_CLASSIFY_TIMEOUT_MS,
): Promise<ContentScores> {
  if (!classifier) {
    throw new RiskError(
      "classification_unavailable",
      "Content classification isn't available at the moment. Retry later.",
    );
  }
  try {
    const verdict = await classifier.classify(
      { kind: "text", text: prepareText(text), links: prepareLinks(urlsInText(text)) },
      AbortSignal.timeout(timeoutMs),
    );
    return Object.fromEntries(
      CONTENT_CATEGORIES.map((category) => [
        category,
        Math.round(Math.min(1, Math.max(0, verdict.scores[category] ?? 0)) * 1000) / 1000,
      ]),
    ) as ContentScores;
  } catch (error) {
    // Never the text: only that the model failed.
    console.warn(
      "[risk] Content classification failed:",
      error instanceof Error ? error.name : "error",
    );
    throw new RiskError(
      "classification_unavailable",
      "Content classification failed or timed out. Retry later.",
    );
  }
}

/**
 * Content scores for an assessment: `null` and degraded when classification is unavailable or the
 * organization's classification budget is spent, so the assessment never fails because of it.
 */
export async function assessmentContentScores(
  deps: RiskDeps,
  environment: LookupEnvironment,
  text: string | undefined,
): Promise<{ scores: ContentScores | null; degraded: boolean }> {
  if (text === undefined) return { scores: null, degraded: false };
  if (environment.mode === "live" && (await isHipaaMode(environment.organizationId))) {
    return { scores: null, degraded: false };
  }
  try {
    if (environment.mode === "live" && deps.chargeClassification) {
      const allowed = await deps.chargeClassification(environment.organizationId);
      if (!allowed) return { scores: null, degraded: true };
    }
    return { scores: (await classifyContent(deps, environment, text)).scores, degraded: false };
  } catch {
    return { scores: null, degraded: true };
  }
}
