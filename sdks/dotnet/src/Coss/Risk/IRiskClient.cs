using Coss.Risk;

namespace Coss;

public partial interface IRiskClient
{
    public IAssessmentsClient Assessments { get; }
    public IListsClient Lists { get; }
    public IUsersClient Users { get; }
    public Coss.Risk.ISettingsClient Settings { get; }
    public IRulesClient Rules { get; }
    public ILimitBucketsClient LimitBuckets { get; }

    /// <summary>
    /// Assesses a sign-up, login or other event in the API key's environment and returns a decision (`allow`, `review` or `block`) with a score and the reasons behind it. coss.com combines email and IP signals with what it has seen in this environment (velocity, accounts sharing a mailbox, identifiers you reported) and your allow and block lists. Signals that are unavailable at the moment are skipped and listed in `degraded`. Call it from your server, never from the browser, and treat errors as `allow` (fail open) so an outage never locks your users out. `review` decisions also fire a `risk.assessment.review` webhook. Live assessments are billed (`risk.assessments`; plans include some every month) unless they end in `block`. Past Free's allowance, on a billing hold or over a budget, they are free and made without velocity, memory or content (`usage_limit` in `degraded`); they never fail over billing. Sandbox (`coss_test_…`) keys accept documented test addresses (`192.0.2.x`, `@disposable.test`, `@undeliverable.test`).
    /// </summary>
    WithRawResponseTask<RiskAssessment> AssessAsync(
        CreateRiskAssessmentRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Tells coss.com what the assessed user turned out to be. `fraud` and `abuse` make later assessments with the same mailbox, user, IP address or subnet flag it (`history.fraud_*`); `legitimate` takes back what this assessment reported. Resolves an open review. Sending the latest outcome again changes nothing.
    /// </summary>
    WithRawResponseTask<RiskAssessment> FeedbackAsync(
        CreateRiskFeedbackRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// How often each reason and rule was right over the last 90 days, by the outcomes you reported with feedback, and the reason weights that supports. Nothing changes until you apply them with `reason_weights` in the settings.
    /// </summary>
    WithRawResponseTask<RiskCalibration> CalibrationAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Email intelligence on its own: syntax, disposable domains, whether the domain can receive mail (DNS), role accounts, free providers, the canonical mailbox, typo suggestions and the domain's age (RDAP). Stateless: nothing is stored or counted, so it never flags an address for having been seen before (assessments do). Failed lookups are listed in `degraded`. Sandbox keys see the documented test domains (`@disposable.test`, `@undeliverable.test`, `@new.test`).
    /// </summary>
    WithRawResponseTask<RiskEmailCheck> CheckEmailAsync(
        RiskEmailCheckRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// IP intelligence on its own: Tor exit nodes, cloud and hosting networks, networks mostly used by VPN and proxy services, the network (ASN) and its country. Stateless. Missing IP data is reported in `degraded`. Sandbox keys see the documentation addresses (`192.0.2.1` Tor, `.2` cloud, `.3` VPN, the rest residential).
    /// </summary>
    WithRawResponseTask<RiskIpCheck> CheckIpAsync(
        RiskIpCheckRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Phone intelligence on its own: whether the number exists in its country's numbering plan, its line type (mobile, landline, fixed or non-fixed VoIP, toll-free…) and carrier, and the last SIM swap where carriers share it. Stateless. A failed lookup is reported in `degraded`. Each live check that gets an answer is billed (`risk.phone_checks`; plans include some every month, and Free stops at its allowance); invalid numbers, failed lookups and sandbox checks are free. Limited per organization as well as per key. Sandbox keys see the fictional numbers `+1 202 555 01xx` (`0101` landline, `0102` non-fixed VoIP, `0103` fixed VoIP, `0104` a recent SIM swap, `0199` invalid, the rest mobile).
    /// </summary>
    WithRawResponseTask<RiskPhoneCheck> CheckPhoneAsync(
        RiskPhoneCheckRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Scores text people post on your platform (a profile bio, a comment, a listing) for spam, phishing, malware and fraud with an AI model, with zero data retention. Returns scores only: you decide what they mean. Neither the text nor the scores are stored, and request logs keep no body for this endpoint. Takes up to 3 seconds; a failure is a 503 you can retry or treat as unknown. Each live classification the model answered is billed (`risk.content_checks`; plans include some every month, and Free stops at its allowance). Limited per organization as well as per key. Sandbox keys use markers instead of a model: `[coss-test:phishing]` scores 0.99, `[coss-test:spam:0.4]` exactly 0.4, everything else 0.01.
    /// </summary>
    WithRawResponseTask<RiskContentClassification> ClassifyAsync(
        RiskContentClassifyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Takes `cost` tokens (default 1) from `key`'s share of one of your buckets and says whether to let the request through: a 200 either way, with `allowed`. Denied requests take nothing. Each key has its own bucket of `burst` tokens refilling at `limit` per `period_seconds` (GCRA, the algorithm coss.com limits its own API with). coss.com keeps only a keyed hash of `key`. While coss.com can't count, the bucket's `on_failure` answers and `degraded` is true.
    /// </summary>
    WithRawResponseTask<RiskLimit> LimitAsync(
        CheckRiskLimitRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
