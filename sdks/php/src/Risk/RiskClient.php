<?php

namespace Coss\Risk;

use Coss\Risk\Assessments\AssessmentsClient;
use Coss\Risk\Lists\ListsClient;
use Coss\Risk\Users\UsersClient;
use Coss\Risk\Settings\SettingsClient;
use Coss\Risk\Rules\RulesClient;
use Coss\Risk\LimitBuckets\LimitBucketsClient;
use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Risk\Requests\CreateRiskAssessmentRequest;
use Coss\Types\RiskAssessment;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Client\IdempotencyKey;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Risk\Requests\CreateRiskFeedbackRequest;
use Coss\Types\RiskCalibration;
use Coss\Risk\Requests\RiskEmailCheckRequest;
use Coss\Types\RiskEmailCheck;
use Coss\Risk\Requests\RiskIpCheckRequest;
use Coss\Types\RiskIpCheck;
use Coss\Risk\Requests\RiskPhoneCheckRequest;
use Coss\Types\RiskPhoneCheck;
use Coss\Risk\Requests\RiskContentClassifyRequest;
use Coss\Types\RiskContentClassification;
use Coss\Risk\Requests\CheckRiskLimitRequest;
use Coss\Types\RiskLimit;

class RiskClient
{
    /**
     * @var AssessmentsClient $assessments
     */
    public AssessmentsClient $assessments;

    /**
     * @var ListsClient $lists
     */
    public ListsClient $lists;

    /**
     * @var UsersClient $users
     */
    public UsersClient $users;

    /**
     * @var SettingsClient $settings
     */
    public SettingsClient $settings;

    /**
     * @var RulesClient $rules
     */
    public RulesClient $rules;

    /**
     * @var LimitBucketsClient $limitBuckets
     */
    public LimitBucketsClient $limitBuckets;

    /**
     * @var array{
     *   baseUrl?: string,
     *   client?: ClientInterface,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     * } $options @phpstan-ignore-next-line Property is used in endpoint methods via HttpEndpointGenerator
     */
    private array $options;

    /**
     * @var RawClient $client
     */
    private RawClient $client;

    /**
     * @param RawClient $client
     * @param ?array{
     *   baseUrl?: string,
     *   client?: ClientInterface,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     * } $options
     */
    public function __construct(
        RawClient $client,
        ?array $options = null,
    ) {
        $this->client = $client;
        $this->options = $options ?? [];
        $this->assessments = new AssessmentsClient($this->client, $this->options);
        $this->lists = new ListsClient($this->client, $this->options);
        $this->users = new UsersClient($this->client, $this->options);
        $this->settings = new SettingsClient($this->client, $this->options);
        $this->rules = new RulesClient($this->client, $this->options);
        $this->limitBuckets = new LimitBucketsClient($this->client, $this->options);
    }

    /**
     * Assesses a sign-up, login or other event in the API key's environment and returns a decision (`allow`, `review` or `block`) with a score and the reasons behind it. coss.com combines email and IP signals with what it has seen in this environment (velocity, accounts sharing a mailbox, identifiers you reported) and your allow and block lists. Signals that are unavailable at the moment are skipped and listed in `degraded`. Call it from your server, never from the browser, and treat errors as `allow` (fail open) so an outage never locks your users out. `review` decisions also fire a `risk.assessment.review` webhook. Live assessments are billed (`risk.assessments`; plans include some every month) unless they end in `block`. Past Free's allowance, on a billing hold or over a budget, they are free and made without velocity, memory or content (`usage_limit` in `degraded`); they never fail over billing. Sandbox (`coss_test_…`) keys accept documented test addresses (`192.0.2.x`, `@disposable.test`, `@undeliverable.test`).
     *
     * Example:
     * ```php
     * $client->risk->assess(
     *     new CreateRiskAssessmentRequest([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'event' => RiskEvent::Signup->value,
     *         'user' => new CreateRiskAssessmentRequestUser([
     *             'email' => 'ada@gmail.con',
     *         ]),
     *         'ip' => '203.0.113.7',
     *         'userAgent' => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15',
     *     ]),
     * );
     * ```
     *
     * @param CreateRiskAssessmentRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskAssessment
     * @throws CossException
     * @throws CossApiException
     */
    public function assess(CreateRiskAssessmentRequest $request, ?array $options = null): ?RiskAssessment
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        if ($request->idempotencyKey != null) {
            $headers['Idempotency-Key'] = $request->idempotencyKey;
        }
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/assessments",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskAssessment::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * Tells coss.com what the assessed user turned out to be. `fraud` and `abuse` make later assessments with the same mailbox, user, IP address or subnet flag it (`history.fraud_*`); `legitimate` takes back what this assessment reported. Resolves an open review. Sending the latest outcome again changes nothing.
     *
     * Example:
     * ```php
     * $client->risk->feedback(
     *     'rsk_01k7c8m4q2f3e9v6t5r1n0p8yz',
     *     new CreateRiskFeedbackRequest([
     *         'outcome' => RiskOutcome::Fraud->value,
     *     ]),
     * );
     * ```
     *
     * @param string $id The assessment's id.
     * @param CreateRiskFeedbackRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskAssessment
     * @throws CossException
     * @throws CossApiException
     */
    public function feedback(string $id, CreateRiskFeedbackRequest $request, ?array $options = null): ?RiskAssessment
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/assessments/" . RawClient::encodePathParam($id) . "/feedback",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskAssessment::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * How often each reason and rule was right over the last 90 days, by the outcomes you reported with feedback, and the reason weights that supports. Nothing changes until you apply them with `reason_weights` in the settings.
     *
     * Example:
     * ```php
     * $client->risk->calibration();
     * ```
     *
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskCalibration
     * @throws CossException
     * @throws CossApiException
     */
    public function calibration(?array $options = null): ?RiskCalibration
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/calibration",
                    method: HttpMethod::GET,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskCalibration::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * Email intelligence on its own: syntax, disposable domains, whether the domain can receive mail (DNS), role accounts, free providers, the canonical mailbox, typo suggestions and the domain's age (RDAP). Stateless: nothing is stored or counted, so it never flags an address for having been seen before (assessments do). Failed lookups are listed in `degraded`. Sandbox keys see the documented test domains (`@disposable.test`, `@undeliverable.test`, `@new.test`).
     *
     * Example:
     * ```php
     * $client->risk->checkEmail(
     *     new RiskEmailCheckRequest([
     *         'email' => 'ada@gnail.com',
     *     ]),
     * );
     * ```
     *
     * @param RiskEmailCheckRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskEmailCheck
     * @throws CossException
     * @throws CossApiException
     */
    public function checkEmail(RiskEmailCheckRequest $request, ?array $options = null): ?RiskEmailCheck
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/email/check",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskEmailCheck::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * IP intelligence on its own: Tor exit nodes, cloud and hosting networks, networks mostly used by VPN and proxy services, the network (ASN) and its country. Stateless. Missing IP data is reported in `degraded`. Sandbox keys see the documentation addresses (`192.0.2.1` Tor, `.2` cloud, `.3` VPN, the rest residential).
     *
     * Example:
     * ```php
     * $client->risk->checkIp(
     *     new RiskIpCheckRequest([
     *         'ip' => '185.220.101.1',
     *     ]),
     * );
     * ```
     *
     * @param RiskIpCheckRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskIpCheck
     * @throws CossException
     * @throws CossApiException
     */
    public function checkIp(RiskIpCheckRequest $request, ?array $options = null): ?RiskIpCheck
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/ip/check",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskIpCheck::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * Phone intelligence on its own: whether the number exists in its country's numbering plan, its line type (mobile, landline, fixed or non-fixed VoIP, toll-free…) and carrier, and the last SIM swap where carriers share it. Stateless. A failed lookup is reported in `degraded`. Each live check that gets an answer is billed (`risk.phone_checks`; plans include some every month, and Free stops at its allowance); invalid numbers, failed lookups and sandbox checks are free. Limited per organization as well as per key. Sandbox keys see the fictional numbers `+1 202 555 01xx` (`0101` landline, `0102` non-fixed VoIP, `0103` fixed VoIP, `0104` a recent SIM swap, `0199` invalid, the rest mobile).
     *
     * Example:
     * ```php
     * $client->risk->checkPhone(
     *     new RiskPhoneCheckRequest([
     *         'phone' => '+14155550123',
     *     ]),
     * );
     * ```
     *
     * @param RiskPhoneCheckRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskPhoneCheck
     * @throws CossException
     * @throws CossApiException
     */
    public function checkPhone(RiskPhoneCheckRequest $request, ?array $options = null): ?RiskPhoneCheck
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/phone/check",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskPhoneCheck::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * Scores text people post on your platform (a profile bio, a comment, a listing) for spam, phishing, malware and fraud with an AI model, with zero data retention. Returns scores only: you decide what they mean. Neither the text nor the scores are stored, and request logs keep no body for this endpoint. Takes up to 3 seconds; a failure is a 503 you can retry or treat as unknown. Each live classification the model answered is billed (`risk.content_checks`; plans include some every month, and Free stops at its allowance). Limited per organization as well as per key. Sandbox keys use markers instead of a model: `[coss-test:phishing]` scores 0.99, `[coss-test:spam:0.4]` exactly 0.4, everything else 0.01.
     *
     * Example:
     * ```php
     * $client->risk->classify(
     *     new RiskContentClassifyRequest([
     *         'text' => 'Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash',
     *     ]),
     * );
     * ```
     *
     * @param RiskContentClassifyRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskContentClassification
     * @throws CossException
     * @throws CossApiException
     */
    public function classify(RiskContentClassifyRequest $request, ?array $options = null): ?RiskContentClassification
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/content/classify",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskContentClassification::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }

    /**
     * Takes `cost` tokens (default 1) from `key`'s share of one of your buckets and says whether to let the request through: a 200 either way, with `allowed`. Denied requests take nothing. Each key has its own bucket of `burst` tokens refilling at `limit` per `period_seconds` (GCRA, the algorithm coss.com limits its own API with). coss.com keeps only a keyed hash of `key`. While coss.com can't count, the bucket's `on_failure` answers and `degraded` is true.
     *
     * Example:
     * ```php
     * $client->risk->limit(
     *     new CheckRiskLimitRequest([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'bucket' => 'password_reset',
     *         'key' => 'ada@example.com',
     *     ]),
     * );
     * ```
     *
     * @param CheckRiskLimitRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?RiskLimit
     * @throws CossException
     * @throws CossApiException
     */
    public function limit(CheckRiskLimitRequest $request, ?array $options = null): ?RiskLimit
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        if ($request->idempotencyKey != null) {
            $headers['Idempotency-Key'] = $request->idempotencyKey;
        }
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/risk/limits",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return RiskLimit::fromJson($json);
            }
        } catch (JsonException $e) {
            throw new CossException(message: "Failed to deserialize response: {$e->getMessage()}", previous: $e);
        } catch (ClientExceptionInterface $e) {
            throw new CossException(message: $e->getMessage(), previous: $e);
        }
        throw new CossApiException(
            message: 'API request failed',
            statusCode: $statusCode,
            body: $response->getBody()->getContents(),
        );
    }
}
