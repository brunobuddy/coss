<?php

namespace Coss\Scheduling\Sessions;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Sessions\Requests\CreateSchedulingHostSessionRequest;
use Coss\Types\SchedulingSession;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Client\IdempotencyKey;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Scheduling\Sessions\Requests\CreateSchedulingBookerSessionRequest;

class SessionsClient
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
     * Lets one host manage their own hours, calendars and locations, on coss.com's hosted page or your own UI. Send the `url` to their browser, or embed it with `coss/scheduling`.
     *
     * Example:
     * ```php
     * $client->scheduling->sessions->createForHost(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new CreateSchedulingHostSessionRequest([
     *         'expiresIn' => 3600,
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param CreateSchedulingHostSessionRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSession
     * @throws CossException
     * @throws CossApiException
     */
    public function createForHost(string $host, CreateSchedulingHostSessionRequest $request = new CreateSchedulingHostSessionRequest(), ?array $options = null): ?SchedulingSession
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/sessions",
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
                return SchedulingSession::fromJson($json);
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
     * Lets a browser book one event type, on coss.com's hosted page or your own UI, without your API key.
     *
     * Example:
     * ```php
     * $client->scheduling->sessions->createForBooker(
     *     new CreateSchedulingBookerSessionRequest([
     *         'eventType' => 'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *         'attendee' => new CreateSchedulingBookerSessionRequestAttendee([
     *             'uid' => 'patient_77',
     *             'name' => 'Sam Lee',
     *             'timeZone' => 'UTC',
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param CreateSchedulingBookerSessionRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSession
     * @throws CossException
     * @throws CossApiException
     */
    public function createForBooker(CreateSchedulingBookerSessionRequest $request, ?array $options = null): ?SchedulingSession
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/booker_sessions",
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
                return SchedulingSession::fromJson($json);
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
     * Lets an attendee reschedule or cancel this one booking, within the event type's cutoffs. Stops working when the booking's cancelled, or a day after it ends.
     *
     * Example:
     * ```php
     * $client->scheduling->sessions->createForBooking(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSession
     * @throws CossException
     * @throws CossApiException
     */
    public function createForBooking(string $id, ?array $options = null): ?SchedulingSession
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/manage_sessions",
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
                return SchedulingSession::fromJson($json);
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
