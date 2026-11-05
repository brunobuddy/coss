<?php

namespace Coss\Scheduling\Schedules;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Types\SchedulingScheduleList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Scheduling\Schedules\Requests\CreateSchedulesRequest;
use Coss\Types\SchedulingSchedule;
use Coss\Core\Client\IdempotencyKey;
use Coss\Scheduling\Schedules\Requests\UpdateSchedulesRequest;
use Coss\Types\DeletedSchedulingSchedule;

class SchedulesClient
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
     * All of the host's schedules, oldest first.
     *
     * Example:
     * ```php
     * $client->scheduling->schedules->list(
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
     * @return ?SchedulingScheduleList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(string $host, ?array $options = null): ?SchedulingScheduleList
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/schedules",
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
                return SchedulingScheduleList::fromJson($json);
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
     * A host's weekly hours and date overrides, in local time. The first one is the host's default.
     *
     * Example:
     * ```php
     * $client->scheduling->schedules->create(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new CreateSchedulesRequest([
     *         'body' => new UpsertScheduleRequest([
     *             'name' => 'Clinic hours',
     *             'rules' => [
     *                 new SchedulingWeeklyRule([
     *                     'days' => [
     *                         1,
     *                         2,
     *                         3,
     *                         4,
     *                         5,
     *                     ],
     *                     'start' => '09:00',
     *                     'end' => '17:00',
     *                 ]),
     *             ],
     *             'overrides' => [
     *                 new SchedulingScheduleOverride([
     *                     'date' => '2027-12-24',
     *                     'ranges' => [
     *                         new SchedulingScheduleOverrideRangesItem([
     *                             'start' => 'start',
     *                             'end' => 'end',
     *                         ]),
     *                     ],
     *                 ]),
     *             ],
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param CreateSchedulesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSchedule
     * @throws CossException
     * @throws CossApiException
     */
    public function create(string $host, CreateSchedulesRequest $request, ?array $options = null): ?SchedulingSchedule
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/schedules",
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
                return SchedulingSchedule::fromJson($json);
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
     * One of the host's schedules.
     *
     * Example:
     * ```php
     * $client->scheduling->schedules->get(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     'sched_01kd2m9a0b1c2d3e4f5g6h7j8m',
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param string $scheduleId The schedule's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSchedule
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $host, string $scheduleId, ?array $options = null): ?SchedulingSchedule
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/schedules/" . RawClient::encodePathParam($scheduleId),
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
                return SchedulingSchedule::fromJson($json);
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
     * Replaces its weekly rules, and its overrides when given. Existing bookings stay: a schedule only decides what's offered next.
     *
     * Example:
     * ```php
     * $client->scheduling->schedules->update(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     'sched_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new UpdateSchedulesRequest([
     *         'body' => new UpsertScheduleRequest([
     *             'name' => 'Clinic hours',
     *             'rules' => [
     *                 new SchedulingWeeklyRule([
     *                     'days' => [
     *                         1,
     *                         2,
     *                         3,
     *                         4,
     *                         5,
     *                     ],
     *                     'start' => '09:00',
     *                     'end' => '17:00',
     *                 ]),
     *             ],
     *             'overrides' => [
     *                 new SchedulingScheduleOverride([
     *                     'date' => '2027-12-24',
     *                     'ranges' => [
     *                         new SchedulingScheduleOverrideRangesItem([
     *                             'start' => 'start',
     *                             'end' => 'end',
     *                         ]),
     *                     ],
     *                 ]),
     *             ],
     *         ]),
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param string $scheduleId The schedule's id.
     * @param UpdateSchedulesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingSchedule
     * @throws CossException
     * @throws CossApiException
     */
    public function update(string $host, string $scheduleId, UpdateSchedulesRequest $request, ?array $options = null): ?SchedulingSchedule
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/schedules/" . RawClient::encodePathParam($scheduleId),
                    method: HttpMethod::PUT,
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
                return SchedulingSchedule::fromJson($json);
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
     * Refused for the host's default schedule.
     *
     * Example:
     * ```php
     * $client->scheduling->schedules->remove(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     'sched_01kd2m9a0b1c2d3e4f5g6h7j8m',
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param string $scheduleId The schedule's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?DeletedSchedulingSchedule
     * @throws CossException
     * @throws CossApiException
     */
    public function remove(string $host, string $scheduleId, ?array $options = null): ?DeletedSchedulingSchedule
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host) . "/schedules/" . RawClient::encodePathParam($scheduleId),
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
                return DeletedSchedulingSchedule::fromJson($json);
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
