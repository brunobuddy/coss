<?php

namespace Coss\Hooks\Messages;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Hooks\Messages\Requests\ListMessagesRequest;
use Coss\Types\HookMessageList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Hooks\Messages\Requests\SendHookMessageRequest;
use Coss\Types\HookMessage;
use Coss\Core\Client\IdempotencyKey;
use Coss\Types\HookDeliveryList;

class MessagesClient
{
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
    }

    /**
     * The application's messages, newest first (kept for 30 days).
     *
     * Example:
     * ```php
     * $client->hooks->messages->list(
     *     'customer_8812',
     *     new ListMessagesRequest([]),
     * );
     * ```
     *
     * @param string $application The application's `id` (`happ_…`) or your `uid` for it.
     * @param ListMessagesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?HookMessageList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(string $application, ListMessagesRequest $request = new ListMessagesRequest(), ?array $options = null): ?HookMessageList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        if ($request->eventType != null) {
            $query['event_type'] = $request->eventType;
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
                    path: "v1/hooks/applications/" . RawClient::encodePathParam($application) . "/messages",
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
                return HookMessageList::fromJson($json);
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
     * Queues a message to the application: coss.com delivers it to each of its enabled endpoints subscribed to `event_type` within seconds, signed with each endpoint's secret, and retries failures with backoff for about a day. Each request's `webhook-id` header is the message's id. Counts against the send quota once per endpoint it goes to (at least once). A live message is billed once, whatever its fan-out; retries and sandbox are free. Live sends are refused while the organization is suspended (`account_suspended`), on a billing hold (`billing_hold`), over a budget (`budget_exceeded`) or past Free's monthly messages (`usage_limit_exceeded`). Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
     *
     * Example:
     * ```php
     * $client->hooks->messages->send(
     *     'customer_8812',
     *     new SendHookMessageRequest([
     *         'idempotencyKey' => 'invoice-1042-paid',
     *         'eventType' => 'invoice.paid',
     *         'payload' => [
     *             'invoice_id' => "in_1042",
     *             'amount' => 4200,
     *             'currency' => "usd",
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param string $application The application's `id` (`happ_…`) or your `uid` for it.
     * @param SendHookMessageRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?HookMessage
     * @throws CossException
     * @throws CossApiException
     */
    public function send(string $application, SendHookMessageRequest $request, ?array $options = null): ?HookMessage
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
                    path: "v1/hooks/applications/" . RawClient::encodePathParam($application) . "/messages",
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
                return HookMessage::fromJson($json);
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
     * A message of the application, with its payload.
     *
     * Example:
     * ```php
     * $client->hooks->messages->get(
     *     'customer_8812',
     *     'hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $application The application's `id` (`happ_…`) or your `uid` for it.
     * @param string $messageId
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?HookMessage
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $application, string $messageId, ?array $options = null): ?HookMessage
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/hooks/applications/" . RawClient::encodePathParam($application) . "/messages/" . RawClient::encodePathParam($messageId),
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
                return HookMessage::fromJson($json);
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
     * One delivery per endpoint the message went to.
     *
     * Example:
     * ```php
     * $client->hooks->messages->listDeliveries(
     *     'customer_8812',
     *     'hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $application The application's `id` (`happ_…`) or your `uid` for it.
     * @param string $messageId
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?HookDeliveryList
     * @throws CossException
     * @throws CossApiException
     */
    public function listDeliveries(string $application, string $messageId, ?array $options = null): ?HookDeliveryList
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/hooks/applications/" . RawClient::encodePathParam($application) . "/messages/" . RawClient::encodePathParam($messageId) . "/deliveries",
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
                return HookDeliveryList::fromJson($json);
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
