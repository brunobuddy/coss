<?php

namespace Coss\Scheduling\Series;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Series\Requests\CreateSeriesBody;
use Coss\Types\SchedulingSeries;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Client\IdempotencyKey;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Types\CreateSeriesRequest;
use Coss\Types\SchedulingSeriesPreview;
use Coss\Scheduling\Series\Requests\CancelSeriesRequest;
use Coss\Types\SchedulingCancelledSeries;

class SeriesClient
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
     * Books up to 52 occurrences, keeping the attendee's local time across DST changes. Each one is an ordinary booking that can move on its own, and a pool keeps one host throughout.
     *
     * Example:
     * ```php
     * $client->scheduling->series->create(
     *     new CreateSeriesBody([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'body' => new CreateSeriesRequest([
     *             'eventType' => 'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *             'start' => '2027-01-04T15:00:00.000Z',
     *             'attendee' => new SchedulingAttendeeInput([
     *                 'uid' => 'patient_77',
     *                 'timeZone' => 'America/New_York',
     *             ]),
     *             'recurrence' => new CreateSeriesRequestRecurrence([
     *                 'frequency' => CreateSeriesRequestRecurrenceFrequency::Weekly->value,
     *                 'interval' => 1,
     *                 'count' => 12,
     *             ]),
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param CreateSeriesBody $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSeries
     * @throws CossException
     * @throws CossApiException
     */
    public function create(CreateSeriesBody $request, ?array $options = null): ?SchedulingSeries
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
                    path: "v1/scheduling/series",
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
                return SchedulingSeries::fromJson($json);
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
     * Which occurrences would be free, without booking anything.
     *
     * Example:
     * ```php
     * $client->scheduling->series->preview(
     *     new CreateSeriesRequest([
     *         'eventType' => 'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *         'start' => '2027-01-04T15:00:00.000Z',
     *         'attendee' => new SchedulingAttendeeInput([
     *             'uid' => 'patient_77',
     *             'timeZone' => 'America/New_York',
     *         ]),
     *         'recurrence' => new CreateSeriesRequestRecurrence([
     *             'frequency' => CreateSeriesRequestRecurrenceFrequency::Weekly->value,
     *             'interval' => 1,
     *             'count' => 12,
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param CreateSeriesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSeriesPreview
     * @throws CossException
     * @throws CossApiException
     */
    public function preview(CreateSeriesRequest $request, ?array $options = null): ?SchedulingSeriesPreview
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/series/preview",
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
                return SchedulingSeriesPreview::fromJson($json);
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
     * Cancels the occurrences from `from_index` on, or all of them.
     *
     * Example:
     * ```php
     * $client->scheduling->series->cancel(
     *     'series_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new CancelSeriesRequest([
     *         'fromIndex' => 4,
     *     ]),
     * );
     * ```
     *
     * @param string $id The series' id.
     * @param CancelSeriesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingCancelledSeries
     * @throws CossException
     * @throws CossApiException
     */
    public function cancel(string $id, CancelSeriesRequest $request = new CancelSeriesRequest(), ?array $options = null): ?SchedulingCancelledSeries
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/series/" . RawClient::encodePathParam($id) . "/cancel",
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
                return SchedulingCancelledSeries::fromJson($json);
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
