<?php

namespace Coss\Scheduling\Calendars;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Calendars\Requests\AuthorizeCalendarRequest;
use Coss\Types\SchedulingCalendarAuthorization;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Client\IdempotencyKey;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Types\SchedulingCalendarConnectionList;
use Coss\Scheduling\Calendars\Requests\ConnectCalendarsRequest;
use Coss\Types\SchedulingCalendarConnection;
use Coss\Types\DeletedSchedulingCalendarConnection;
use Coss\Scheduling\Calendars\Requests\UpdateCalendarRequest;
use Coss\Scheduling\Calendars\Requests\SetSimulatedBusyRequest;

class CalendarsClient
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
     * A URL for the host to give consent at Google or Microsoft. Open it in a new window: providers refuse to be framed. Coss.com reads only busy times, and writes events with a neutral title unless the event type's `host_calendar_details` is `full`.
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->authorize(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new AuthorizeCalendarRequest([
     *         'provider' => AuthorizeCalendarRequestProvider::Google->value,
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param AuthorizeCalendarRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingCalendarAuthorization
     * @throws CossException
     * @throws CossApiException
     */
    public function authorize(string $host, AuthorizeCalendarRequest $request, ?array $options = null): ?SchedulingCalendarAuthorization
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/calendar_connections/authorize",
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
                return SchedulingCalendarAuthorization::fromJson($json);
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
     * With each connection's calendars and which of them count.
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->list(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingCalendarConnectionList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(string $host, ?array $options = null): ?SchedulingCalendarConnectionList
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/calendar_connections",
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
                return SchedulingCalendarConnectionList::fromJson($json);
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
     * CalDAV (Apple and others) with an app password, or, in sandbox environments, a `simulated` calendar whose busy times you set yourself. Google and Microsoft use `authorize`.
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->connect(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new ConnectCalendarsRequest([
     *         'body' => CreateCalendarConnectionRequest::caldav(new CreateCalendarConnectionRequestCaldav([
     *             'url' => 'url',
     *             'username' => 'username',
     *             'password' => 'password',
     *         ])),
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param ConnectCalendarsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingCalendarConnection
     * @throws CossException
     * @throws CossApiException
     */
    public function connect(string $host, ConnectCalendarsRequest $request, ?array $options = null): ?SchedulingCalendarConnection
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/calendar_connections",
                    method: HttpMethod::POST,
                    headers: $headers,
                    body: $request->body,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return SchedulingCalendarConnection::fromJson($json);
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
     * Revokes coss.com's access and deletes every busy time read through it. One a calendar delegation manages is refused (`calendar_managed`).
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->disconnect(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     'calconn_01kd2m9a0b1c2d3e4f5g6h7j8m',
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param string $id The connection's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?DeletedSchedulingCalendarConnection
     * @throws CossException
     * @throws CossApiException
     */
    public function disconnect(string $host, string $id, ?array $options = null): ?DeletedSchedulingCalendarConnection
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/calendar_connections/" . RawClient::encodePathParam($id),
                    method: HttpMethod::DELETE,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                $json = $response->getBody()->getContents();
                if (empty($json)) {
                    return null;
                }
                return DeletedSchedulingCalendarConnection::fromJson($json);
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
     * Whether its busy times block slots, and whether bookings are written to it.
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->update(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     'cal_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new UpdateCalendarRequest([
     *         'readBusy' => true,
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param string $calendarId The calendar's id.
     * @param UpdateCalendarRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingCalendarConnectionList
     * @throws CossException
     * @throws CossApiException
     */
    public function update(string $host, string $calendarId, UpdateCalendarRequest $request = new UpdateCalendarRequest(), ?array $options = null): ?SchedulingCalendarConnectionList
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/calendars/" . RawClient::encodePathParam($calendarId),
                    method: HttpMethod::PATCH,
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
                return SchedulingCalendarConnectionList::fromJson($json);
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
     * Sandbox environments only: test how bookings react to a busy calendar.
     *
     * Example:
     * ```php
     * $client->scheduling->calendars->setSimulatedBusy(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new SetSimulatedBusyRequest([
     *         'intervals' => [
     *             new SetSimulatedBusyRequestIntervalsItem([
     *                 'start' => '2027-01-04T15:00:00.000Z',
     *                 'end' => '2027-01-04T16:00:00.000Z',
     *             ]),
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param SetSimulatedBusyRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @throws CossException
     * @throws CossApiException
     */
    public function setSimulatedBusy(string $host, SetSimulatedBusyRequest $request, ?array $options = null): void
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/simulated_busy",
                    method: HttpMethod::PUT,
                    body: $request,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                return;
            }
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
