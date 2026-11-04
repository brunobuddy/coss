<?php

namespace Coss\Sms;

use Coss\Sms\Suppressions\SuppressionsClient;
use Coss\Sms\Received\ReceivedClient;
use Coss\Sms\Numbers\NumbersClient;
use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Sms\Requests\ListSmsRequest;
use Coss\Types\SmsList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonSerializer;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Sms\Requests\SendSmsRequest;
use Coss\Types\Sms;
use Coss\Core\Client\IdempotencyKey;
use Coss\Types\SmsEventList;

class SmsClient
{
    /**
     * @var SuppressionsClient $suppressions
     */
    public SuppressionsClient $suppressions;

    /**
     * @var ReceivedClient $received
     */
    public ReceivedClient $received;

    /**
     * @var NumbersClient $numbers
     */
    public NumbersClient $numbers;

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
        $this->suppressions = new SuppressionsClient($this->client, $this->options);
        $this->received = new ReceivedClient($this->client, $this->options);
        $this->numbers = new NumbersClient($this->client, $this->options);
    }

    /**
     * Messages sent from the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
     *
     * Example:
     * ```php
     * $client->sms->list(
     *     new ListSmsRequest([]),
     * );
     * ```
     *
     * @param ListSmsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SmsList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(ListSmsRequest $request = new ListSmsRequest(), ?array $options = null): ?SmsList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        if ($request->to != null) {
            $query['to'] = $request->to;
        }
        if ($request->status != null) {
            $query['status'] = $request->status;
        }
        if ($request->createdAfter != null) {
            $query['created_after'] = JsonSerializer::serializeDateTime($request->createdAfter);
        }
        if ($request->createdBefore != null) {
            $query['created_before'] = JsonSerializer::serializeDateTime($request->createdBefore);
        }
        if ($request->limit != null) {
            $query['limit'] = $request->limit;
        }
        if ($request->after != null) {
            $query['after'] = $request->after;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sms",
                    method: HttpMethod::GET,
                    query: $query,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return SmsList::fromJson($json);
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
     * Queues a text message from the API key's environment and returns it with `status: "queued"`; it is handed to the carrier moments later. Follow it with `GET /v1/sms/{id}` or the `sms.sent`, `sms.delivered`, `sms.undelivered` and `sms.failed` webhooks. Live (`coss_live_…`) keys send `from` one of the organization's numbers whose carrier registration is approved, to the countries the organization allows (US and Canada unless changed in the dashboard). Sandbox (`coss_test_…`) keys accept any `from`, deliver nothing and answer the SMS simulator's numbers (`+15005550006` delivered, `+15005550001` invalid, `+15005550004` filtered by the carrier, `+15005550009` opted out, `+15005550008` replies). A number on the environment's SMS suppression list (it replied STOP, or it can't receive SMS) is skipped: the message is `failed` with `suppressed`. Segments count against the organization's send quota, and each is billed by the destination country.
     *
     * Example:
     * ```php
     * $client->sms->send(
     *     new SendSmsRequest([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'from' => '+14155550123',
     *         'to' => '+14155550199',
     *         'body' => 'Your Acme code is 482913',
     *         'tags' => [
     *             new SendSmsRequestTagsItem([
     *                 'name' => 'flow',
     *                 'value' => 'sign_in',
     *             ]),
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param SendSmsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?Sms
     * @throws CossException
     * @throws CossApiException
     */
    public function send(SendSmsRequest $request, ?array $options = null): ?Sms
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
                    path: "v1/sms",
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
                return Sms::fromJson($json);
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
     * One message sent from the API key's environment, with its current status.
     *
     * Example:
     * ```php
     * $client->sms->get(
     *     'sms_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The message's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?Sms
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $id, ?array $options = null): ?Sms
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sms/" . RawClient::encodePathParam($id),
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
                return Sms::fromJson($json);
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
     * Everything that happened to the message, oldest first.
     *
     * Example:
     * ```php
     * $client->sms->listEvents(
     *     'sms_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The message's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SmsEventList
     * @throws CossException
     * @throws CossApiException
     */
    public function listEvents(string $id, ?array $options = null): ?SmsEventList
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sms/" . RawClient::encodePathParam($id) . "/events",
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
                return SmsEventList::fromJson($json);
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
     * Cancels a message scheduled with `scheduled_at` before it is sent. Canceling a canceled message returns it as is.
     *
     * Example:
     * ```php
     * $client->sms->cancel(
     *     'sms_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The message's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?Sms
     * @throws CossException
     * @throws CossApiException
     */
    public function cancel(string $id, ?array $options = null): ?Sms
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sms/" . RawClient::encodePathParam($id) . "/cancel",
                    method: HttpMethod::POST,
                    headers: $headers,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return Sms::fromJson($json);
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
