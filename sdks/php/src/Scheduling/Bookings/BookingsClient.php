<?php

namespace Coss\Scheduling\Bookings;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Bookings\Requests\ListBookingsRequest;
use Coss\Types\SchedulingBookingList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Scheduling\Bookings\Requests\CreateBookingRequest;
use Coss\Types\SchedulingBooking;
use Coss\Core\Client\IdempotencyKey;
use Coss\Scheduling\Bookings\Requests\RescheduleBookingRequest;
use Coss\Scheduling\Bookings\Requests\CancelSchedulingBookingRequest;
use Coss\Scheduling\Bookings\Requests\EventsBookingsRequest;
use Coss\Types\SchedulingBookingEventList;
use Coss\Scheduling\Bookings\Requests\NotificationsBookingsRequest;
use Coss\Types\SchedulingBookingNotificationList;
use Coss\Scheduling\Bookings\Requests\UpdateBookingLocationRequest;

class BookingsClient
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
     * The environment's bookings, newest first. Answers aren't included.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->list(
     *     new ListBookingsRequest([
     *         'startAfter' => '2027-01-04T15:00:00.000Z',
     *         'startBefore' => '2027-01-04T15:00:00.000Z',
     *     ]),
     * );
     * ```
     *
     * @param ListBookingsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBookingList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(ListBookingsRequest $request = new ListBookingsRequest(), ?array $options = null): ?SchedulingBookingList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        if ($request->limit != null) {
            $query['limit'] = $request->limit;
        }
        if ($request->after != null) {
            $query['after'] = $request->after;
        }
        if ($request->host != null) {
            $query['host'] = $request->host;
        }
        if ($request->eventType != null) {
            $query['event_type'] = $request->eventType;
        }
        if ($request->status != null) {
            $query['status'] = $request->status;
        }
        if ($request->attendeeUid != null) {
            $query['attendee_uid'] = $request->attendeeUid;
        }
        if ($request->startAfter != null) {
            $query['start_after'] = $request->startAfter;
        }
        if ($request->startBefore != null) {
            $query['start_before'] = $request->startBefore;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings",
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
                return SchedulingBookingList::fromJson($json);
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
     * Books a slot, or joins a group session. Without a `host`, a pool chooses fairly among those free. An event type that requires approval answers with a `pending_approval` booking.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->create(
     *     new CreateBookingRequest([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'eventType' => 'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *         'start' => '2027-01-04T15:00:00.000Z',
     *         'attendee' => new SchedulingAttendeeInput([
     *             'uid' => 'patient_77',
     *             'name' => 'Sam Lee',
     *             'email' => 'sam@example.com',
     *             'timeZone' => 'UTC',
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param CreateBookingRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function create(CreateBookingRequest $request, ?array $options = null): ?SchedulingBooking
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
                    path: "v1/scheduling/bookings",
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
                return SchedulingBooking::fromJson($json);
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
     * A booking with its attendees and their answers.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->get(
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
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $id, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id),
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
                return SchedulingBooking::fromJson($json);
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
     * Moves it to a new time, keeping its id. The old time stays booked if the new one isn't free.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->reschedule(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new RescheduleBookingRequest([
     *         'start' => '2027-01-05T15:00:00.000Z',
     *     ]),
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param RescheduleBookingRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function reschedule(string $id, RescheduleBookingRequest $request, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/reschedule",
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
                return SchedulingBooking::fromJson($json);
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
     * Frees the time and removes the calendar event. A cancelled booking stays charged.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->cancel(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new CancelSchedulingBookingRequest([
     *         'reason' => 'Feeling better',
     *     ]),
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param CancelSchedulingBookingRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function cancel(string $id, CancelSchedulingBookingRequest $request = new CancelSchedulingBookingRequest(), ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/cancel",
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
                return SchedulingBooking::fromJson($json);
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
     * What's happened to a booking, oldest first, and who did it. There's no personal data in here.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->events(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new EventsBookingsRequest([]),
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param EventsBookingsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBookingEventList
     * @throws CossException
     * @throws CossApiException
     */
    public function events(string $id, EventsBookingsRequest $request = new EventsBookingsRequest(), ?array $options = null): ?SchedulingBookingEventList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
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
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/events",
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
                return SchedulingBookingEventList::fromJson($json);
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
     * Confirms a `pending_approval` booking.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->approve(
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
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function approve(string $id, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/approve",
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
                return SchedulingBooking::fromJson($json);
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
     * Refuses a `pending_approval` booking and frees the time.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->decline(
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
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function decline(string $id, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/decline",
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
                return SchedulingBooking::fromJson($json);
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
     * What's been queued for this booking and what became of it, newest first, including why something wasn't sent. It never says who it went to.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->notifications(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new NotificationsBookingsRequest([]),
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param NotificationsBookingsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBookingNotificationList
     * @throws CossException
     * @throws CossApiException
     */
    public function notifications(string $id, NotificationsBookingsRequest $request = new NotificationsBookingsRequest(), ?array $options = null): ?SchedulingBookingNotificationList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
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
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/notifications",
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
                return SchedulingBookingNotificationList::fromJson($json);
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
     * Records that the attendee didn't come, once the booking has started.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->markNoShow(
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
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function markNoShow(string $id, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/no_show",
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
                return SchedulingBooking::fromJson($json);
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
     * Where it happens, such as the meeting link you made after the `scheduling.booking.confirmed` webhook.
     *
     * Example:
     * ```php
     * $client->scheduling->bookings->updateLocation(
     *     'book_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new UpdateBookingLocationRequest([
     *         'location' => SchedulingLocation::link(new SchedulingLocationLink([
     *             'url' => 'https://meet.example.com/abc',
     *         ])),
     *     ]),
     * );
     * ```
     *
     * @param string $id The booking's id.
     * @param UpdateBookingLocationRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingBooking
     * @throws CossException
     * @throws CossApiException
     */
    public function updateLocation(string $id, UpdateBookingLocationRequest $request, ?array $options = null): ?SchedulingBooking
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/bookings/" . RawClient::encodePathParam($id) . "/location",
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
                return SchedulingBooking::fromJson($json);
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
