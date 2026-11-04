import type { CossResult } from "../core/errors.ts";
import type { HttpClient, RequestOptions } from "../core/http.ts";
import type { List } from "../types/email.ts";
import type {
  AssessRiskParams,
  CheckRiskLimitParams,
  CreateRiskLimitBucketParams,
  CreateRiskListEntryParams,
  CreateRiskRuleParams,
  DeletedRiskLimitBucket,
  DeletedRiskListEntry,
  DeletedRiskRule,
  ForgottenRiskUser,
  ListRiskAssessmentsParams,
  ListRiskListEntriesParams,
  RiskAssessment,
  RiskCalibration,
  RiskContentClassification,
  RiskEmailCheck,
  RiskFeedbackParams,
  RiskIpCheck,
  RiskLimit,
  RiskLimitBucket,
  RiskList,
  RiskListEntry,
  RiskListEntryType,
  RiskListEntryValue,
  RiskPhoneCheck,
  RiskRule,
  RiskSettings,
  UpdateRiskLimitBucketParams,
  UpdateRiskRuleParams,
  UpdateRiskSettingsParams,
} from "../types/risk.ts";

type ReadOptions = Pick<RequestOptions, "signal">;

const LIST_ENTRY_TYPES: readonly RiskListEntryType[] = [
  "email",
  "domain",
  "ip",
  "asn",
  "country",
  "user",
];

/** `coss.risk.assessments`: reading past assessments (`assess` lives on `coss.risk`). */
export class RiskAssessmentsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.assessments`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Retrieves one assessment. */
  get(id: string, options?: ReadOptions): Promise<CossResult<RiskAssessment>> {
    return this.#http.request<RiskAssessment>({
      method: "GET",
      path: `/v1/risk/assessments/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }

  /**
   * Lists assessments, newest first (`review_status: "open"` is the review queue). Pass the last
   * `id` as `after` while `has_more` is true.
   */
  list(
    params: ListRiskAssessmentsParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<List<RiskAssessment>>> {
    return this.#http.request<List<RiskAssessment>>({
      method: "GET",
      path: "/v1/risk/assessments",
      query: { ...params },
      signal: options?.signal,
    });
  }
}

/** `coss.risk.lists`: the environment's allow and block lists. */
export class RiskListsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.lists`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Adds an entry: `coss.risk.lists.add("block", { domain: "evil.example" })`. An allow-list match
   * makes decisions `allow`, a block-list match `block`. Returns the existing entry if there is one.
   */
  add(
    list: RiskList,
    entry: RiskListEntryValue & { note?: string; expires_at?: string | Date },
    options?: RequestOptions,
  ): Promise<CossResult<RiskListEntry>> {
    const type = LIST_ENTRY_TYPES.find((name) => name in entry) as RiskListEntryType;
    const body: CreateRiskListEntryParams = {
      list,
      type,
      value: String((entry as Record<string, unknown>)[type] ?? ""),
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.expires_at === undefined
        ? {}
        : {
            expires_at:
              entry.expires_at instanceof Date ? entry.expires_at.toISOString() : entry.expires_at,
          }),
    };
    return this.#http.request<RiskListEntry>({
      method: "POST",
      path: "/v1/risk/list_entries",
      body,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /** Lists entries, newest first. Pass the last `id` as `after` while `has_more` is true. */
  list(
    params: ListRiskListEntriesParams = {},
    options?: ReadOptions,
  ): Promise<CossResult<List<RiskListEntry>>> {
    return this.#http.request<List<RiskListEntry>>({
      method: "GET",
      path: "/v1/risk/list_entries",
      query: { ...params },
      signal: options?.signal,
    });
  }

  /** Retrieves one entry. */
  get(id: string, options?: ReadOptions): Promise<CossResult<RiskListEntry>> {
    return this.#http.request<RiskListEntry>({
      method: "GET",
      path: `/v1/risk/list_entries/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }

  /** Removes an entry. */
  remove(id: string, options?: ReadOptions): Promise<CossResult<DeletedRiskListEntry>> {
    return this.#http.request<DeletedRiskListEntry>({
      method: "DELETE",
      path: `/v1/risk/list_entries/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.risk.settings`: the environment's thresholds, disabled reasons and captcha provider. */
export class RiskSettingsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.settings`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  get(options?: ReadOptions): Promise<CossResult<RiskSettings>> {
    return this.#http.request<RiskSettings>({
      method: "GET",
      path: "/v1/risk/settings",
      signal: options?.signal,
    });
  }

  /** Changes the fields given. The captcha secret is write-only. */
  update(
    params: UpdateRiskSettingsParams,
    options?: ReadOptions,
  ): Promise<CossResult<RiskSettings>> {
    return this.#http.request<RiskSettings>({
      method: "PATCH",
      path: "/v1/risk/settings",
      body: params,
      signal: options?.signal,
    });
  }
}

/**
 * `coss.risk.rules`: the environment's rules. After the lists, the first enabled rule whose
 * conditions match an event decides it.
 */
export class RiskRulesResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.rules`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Creates a rule. Not retried automatically: a retry could create it twice. */
  create(params: CreateRiskRuleParams, options?: ReadOptions): Promise<CossResult<RiskRule>> {
    return this.#http.request<RiskRule>({
      method: "POST",
      path: "/v1/risk/rules",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Every rule, in evaluation order. */
  list(options?: ReadOptions): Promise<CossResult<List<RiskRule>>> {
    return this.#http.request<List<RiskRule>>({
      method: "GET",
      path: "/v1/risk/rules",
      signal: options?.signal,
    });
  }

  get(id: string, options?: ReadOptions): Promise<CossResult<RiskRule>> {
    return this.#http.request<RiskRule>({
      method: "GET",
      path: `/v1/risk/rules/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }

  /** Changes the fields given; `conditions` replaces the whole list. */
  update(
    id: string,
    params: UpdateRiskRuleParams,
    options?: ReadOptions,
  ): Promise<CossResult<RiskRule>> {
    return this.#http.request<RiskRule>({
      method: "PATCH",
      path: `/v1/risk/rules/${encodeURIComponent(id)}`,
      body: params,
      signal: options?.signal,
    });
  }

  delete(id: string, options?: ReadOptions): Promise<CossResult<DeletedRiskRule>> {
    return this.#http.request<DeletedRiskRule>({
      method: "DELETE",
      path: `/v1/risk/rules/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }
}

/**
 * `coss.risk.limitBuckets`: your rate limit buckets, which `coss.risk.limit()` charges per key.
 */
export class RiskLimitBucketsResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.limitBuckets`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /** Creates a bucket. Not retried automatically: a retry would find its name taken. */
  create(
    params: CreateRiskLimitBucketParams,
    options?: ReadOptions,
  ): Promise<CossResult<RiskLimitBucket>> {
    return this.#http.request<RiskLimitBucket>({
      method: "POST",
      path: "/v1/risk/limit_buckets",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /** Every bucket, by name. */
  list(options?: ReadOptions): Promise<CossResult<List<RiskLimitBucket>>> {
    return this.#http.request<List<RiskLimitBucket>>({
      method: "GET",
      path: "/v1/risk/limit_buckets",
      signal: options?.signal,
    });
  }

  get(id: string, options?: ReadOptions): Promise<CossResult<RiskLimitBucket>> {
    return this.#http.request<RiskLimitBucket>({
      method: "GET",
      path: `/v1/risk/limit_buckets/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }

  /** Changes the fields given; the next check uses them. */
  update(
    id: string,
    params: UpdateRiskLimitBucketParams,
    options?: ReadOptions,
  ): Promise<CossResult<RiskLimitBucket>> {
    return this.#http.request<RiskLimitBucket>({
      method: "PATCH",
      path: `/v1/risk/limit_buckets/${encodeURIComponent(id)}`,
      body: params,
      signal: options?.signal,
    });
  }

  delete(id: string, options?: ReadOptions): Promise<CossResult<DeletedRiskLimitBucket>> {
    return this.#http.request<DeletedRiskLimitBucket>({
      method: "DELETE",
      path: `/v1/risk/limit_buckets/${encodeURIComponent(id)}`,
      signal: options?.signal,
    });
  }
}

/** `coss.risk.users`: what coss.com remembers about your users. */
export class RiskUsersResource {
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk.users`. */
  constructor(http: HttpClient) {
    this.#http = http;
  }

  /**
   * Call when you delete a user: coss.com deletes what identifies them (their mailbox, fraud reports,
   * and the user id, email, IP and user agent on their assessments). Safe to repeat.
   */
  forget(userId: string, options?: ReadOptions): Promise<CossResult<ForgottenRiskUser>> {
    return this.#http.request<ForgottenRiskUser>({
      method: "DELETE",
      path: `/v1/risk/users/${encodeURIComponent(userId)}`,
      signal: options?.signal,
    });
  }
}

/**
 * `coss.risk`: assess sign-ups, logins and other events. Call it from your server and treat an
 * error as `allow` (fail open), so an outage never locks your users out.
 *
 * ```ts
 * const { data } = await coss.risk.assess({ event: "signup", user: { email }, ip, user_agent });
 * if (data?.decision === "block") return refuse();
 * ```
 */
export class RiskResource {
  /** Past assessments (`get`, `list`). */
  readonly assessments: RiskAssessmentsResource;
  /** Allow and block lists (`add`, `list`, `get`, `remove`). */
  readonly lists: RiskListsResource;
  /** Forgetting deleted users. */
  readonly users: RiskUsersResource;
  /** Thresholds, disabled reasons and the captcha provider (`get`, `update`). */
  readonly settings: RiskSettingsResource;
  /** Rules (`create`, `list`, `get`, `update`, `delete`). */
  readonly rules: RiskRulesResource;
  /** Your rate limit buckets (`create`, `list`, `get`, `update`, `delete`). */
  readonly limitBuckets: RiskLimitBucketsResource;
  readonly #http: HttpClient;

  /** @internal Use `new Coss().risk`. */
  constructor(http: HttpClient) {
    this.#http = http;
    this.assessments = new RiskAssessmentsResource(http);
    this.lists = new RiskListsResource(http);
    this.users = new RiskUsersResource(http);
    this.settings = new RiskSettingsResource(http);
    this.rules = new RiskRulesResource(http);
    this.limitBuckets = new RiskLimitBucketsResource(http);
  }

  /**
   * Assesses an event and returns the decision with its score and reasons. Retries reuse one
   * `Idempotency-Key`, so an event is never counted twice.
   */
  assess(params: AssessRiskParams, options?: RequestOptions): Promise<CossResult<RiskAssessment>> {
    return this.#http.request<RiskAssessment>({
      method: "POST",
      path: "/v1/risk/assessments",
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /**
   * Reports what an assessed user turned out to be: `fraud` and `abuse` teach later assessments to
   * flag the same mailbox, user, card, device, IP and subnet; `legitimate` takes that back.
   * Resolves a review, and counts in `calibration()`.
   */
  feedback(
    id: string,
    params: RiskFeedbackParams,
    options?: RequestOptions,
  ): Promise<CossResult<RiskAssessment>> {
    return this.#http.request<RiskAssessment>({
      method: "POST",
      path: `/v1/risk/assessments/${encodeURIComponent(id)}/feedback`,
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }

  /**
   * How often each reason and rule was right over the last 90 days, by your feedback, and the
   * reason weights that supports. Apply them with `settings.update({ reason_weights })`.
   */
  calibration(options?: ReadOptions): Promise<CossResult<RiskCalibration>> {
    return this.#http.request<RiskCalibration>({
      method: "GET",
      path: "/v1/risk/calibration",
      signal: options?.signal,
    });
  }

  /**
   * Checks an email address on its own: syntax, disposable domains, deliverability, role
   * accounts, free providers, the canonical mailbox, typos and domain age. Nothing is stored.
   */
  checkEmail(email: string, options?: ReadOptions): Promise<CossResult<RiskEmailCheck>> {
    return this.#http.request<RiskEmailCheck>({
      method: "POST",
      path: "/v1/risk/email/check",
      body: { email },
      signal: options?.signal,
    });
  }

  /**
   * Checks an IP address on its own: Tor, cloud, hosting and VPN networks, ASN and country, and
   * VPN, proxy and relay exits when coss.com's privacy data is available.
   */
  checkIp(ip: string, options?: ReadOptions): Promise<CossResult<RiskIpCheck>> {
    return this.#http.request<RiskIpCheck>({
      method: "POST",
      path: "/v1/risk/ip/check",
      body: { ip },
      signal: options?.signal,
    });
  }

  /**
   * Checks a phone number (E.164) on its own: whether it exists, its line type (mobile, landline,
   * VoIP…) and carrier, and a recent SIM swap where carriers share it. Nothing is stored. Live
   * checks that get an answer are billed, so this method is never retried automatically.
   */
  checkPhone(phone: string, options?: ReadOptions): Promise<CossResult<RiskPhoneCheck>> {
    return this.#http.request<RiskPhoneCheck>({
      method: "POST",
      path: "/v1/risk/phone/check",
      body: { phone },
      retry: false,
      signal: options?.signal,
    });
  }

  /**
   * Scores text for spam, phishing, malware and fraud. Scores only, never a verdict: you choose
   * the thresholds. The text is neither stored nor logged. Live checks that get an answer are
   * billed, so this method is never retried automatically.
   */
  classify(
    params: { text: string },
    options?: ReadOptions,
  ): Promise<CossResult<RiskContentClassification>> {
    return this.#http.request<RiskContentClassification>({
      method: "POST",
      path: "/v1/risk/content/classify",
      body: params,
      retry: false,
      signal: options?.signal,
    });
  }

  /**
   * Takes `cost` tokens (default 1) from `key`'s share of one of your buckets
   * (`coss.risk.limitBuckets`). Retries reuse one `Idempotency-Key`, so they are charged once.
   *
   * ```ts
   * const { data } = await coss.risk.limit({ bucket: "password_reset", key: email });
   * if (data && !data.allowed) return tooManyRequests(data.retry_after_ms);
   * ```
   */
  limit(params: CheckRiskLimitParams, options?: RequestOptions): Promise<CossResult<RiskLimit>> {
    return this.#http.request<RiskLimit>({
      method: "POST",
      path: "/v1/risk/limits",
      body: params,
      idempotencyKey: options?.idempotencyKey,
      signal: options?.signal,
    });
  }
}
