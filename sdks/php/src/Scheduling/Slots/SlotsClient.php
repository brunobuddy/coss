<?php

namespace Coss\Scheduling\Slots;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Slots\Requests\ListSlotsRequest;
use Coss\Types\SchedulingSlotList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Scheduling\Slots\Requests\ExplainSlotsRequest;
use Coss\Types\SchedulingSlotExplanation;

class SlotsClient
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
     * Starts an attendee can book between `start` and `end` (at most 62 days), as UTC instants to show in their own time zone. A host whose calendar can't be read isn't offered.
     *
     * Example:
     * ```php
     * $client->scheduling->slots->list(
     *     'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new ListSlotsRequest([
     *         'start' => '2027-01-04T15:00:00.000Z',
     *         'end' => '2027-01-04T15:00:00.000Z',
     *     ]),
     * );
     * ```
     *
     * @param string $eventType The event type's id or uid.
     * @param ListSlotsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSlotList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(string $eventType, ListSlotsRequest $request, ?array $options = null): ?SchedulingSlotList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        $query['start'] = $request->start;
        $query['end'] = $request->end;
        if ($request->host != null) {
            $query['host'] = $request->host;
        }
        if ($request->durationMinutes != null) {
            $query['duration_minutes'] = $request->durationMinutes;
        }
        if ($request->attributes != null) {
            $query['attributes'] = $request->attributes;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/event_types/" . RawClient::encodePathParam($eventType) . "/slots",
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
                return SchedulingSlotList::fromJson($json);
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
     * Why one start can or can't be booked right now, host by host, decided the same way a booking is. For support and debugging: it says when a host is busy, so don't show it to attendees.
     *
     * Example:
     * ```php
     * $client->scheduling->slots->explain(
     *     'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new ExplainSlotsRequest([
     *         'start' => '2027-01-04T15:00:00.000Z',
     *     ]),
     * );
     * ```
     *
     * @param string $eventType The event type's id or uid.
     * @param ExplainSlotsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSlotExplanation
     * @throws CossException
     * @throws CossApiException
     */
    public function explain(string $eventType, ExplainSlotsRequest $request, ?array $options = null): ?SchedulingSlotExplanation
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        $query['start'] = $request->start;
        if ($request->host != null) {
            $query['host'] = $request->host;
        }
        if ($request->durationMinutes != null) {
            $query['duration_minutes'] = $request->durationMinutes;
        }
        if ($request->attributes != null) {
            $query['attributes'] = $request->attributes;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/event_types/" . RawClient::encodePathParam($eventType) . "/slots/explain",
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
                return SchedulingSlotExplanation::fromJson($json);
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
