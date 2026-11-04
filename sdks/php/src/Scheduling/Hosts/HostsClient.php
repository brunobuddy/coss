<?php

namespace Coss\Scheduling\Hosts;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Hosts\Requests\ListHostsRequest;
use Coss\Types\SchedulingHostList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Scheduling\Hosts\Requests\CreateHostRequest;
use Coss\Types\SchedulingHost;
use Coss\Core\Client\IdempotencyKey;
use Coss\Types\DeletedSchedulingHost;
use Coss\Scheduling\Hosts\Requests\UpdateHostRequest;

class HostsClient
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
     * The environment's hosts, newest first.
     *
     * Example:
     * ```php
     * $client->scheduling->hosts->list(
     *     new ListHostsRequest([]),
     * );
     * ```
     *
     * @param ListHostsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingHostList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(ListHostsRequest $request = new ListHostsRequest(), ?array $options = null): ?SchedulingHostList
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
                    path: "v1/scheduling/hosts",
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
                return SchedulingHostList::fromJson($json);
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
     * A person who can be booked: one of your users, such as a doctor or a tutor.
     *
     * Example:
     * ```php
     * $client->scheduling->hosts->create(
     *     new CreateHostRequest([
     *         'uid' => 'doctor_482',
     *         'name' => 'Dr. Ana Reyes',
     *         'email' => 'ana@example.com',
     *         'timeZone' => 'America/New_York',
     *         'attributes' => [
     *             'licensed_in' => [
     *                 'NY',
     *                 'NJ',
     *             ],
     *         ],
     *         'locations' => [
     *             SchedulingHostLocation::inPerson(new SchedulingHostLocationInPerson([
     *                 'address' => '12 Main St, New York, NY',
     *             ])),
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param CreateHostRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingHost
     * @throws CossException
     * @throws CossApiException
     */
    public function create(CreateHostRequest $request, ?array $options = null): ?SchedulingHost
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts",
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
                return SchedulingHost::fromJson($json);
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
     * A host by its id or your uid.
     *
     * Example:
     * ```php
     * $client->scheduling->hosts->get(
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
     * @return ?SchedulingHost
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $host, ?array $options = null): ?SchedulingHost
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host),
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
                return SchedulingHost::fromJson($json);
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
     * Removes the host and its schedules and calendars. Refused while bookings are still to come (`host_has_live_bookings`): cancel them, or set the host's status to `disabled`.
     *
     * Example:
     * ```php
     * $client->scheduling->hosts->remove(
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
     * @return ?DeletedSchedulingHost
     * @throws CossException
     * @throws CossApiException
     */
    public function remove(string $host, ?array $options = null): ?DeletedSchedulingHost
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host),
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
                return DeletedSchedulingHost::fromJson($json);
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
     * Changes what's given. A `disabled` host keeps its bookings but gets no new ones.
     *
     * Example:
     * ```php
     * $client->scheduling->hosts->update(
     *     'host_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *     new UpdateHostRequest([
     *         'status' => UpdateHostRequestStatus::Disabled->value,
     *     ]),
     * );
     * ```
     *
     * @param string $host The host's id or uid.
     * @param UpdateHostRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingHost
     * @throws CossException
     * @throws CossApiException
     */
    public function update(string $host, UpdateHostRequest $request = new UpdateHostRequest(), ?array $options = null): ?SchedulingHost
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/hosts/" . RawClient::encodePathParam($host),
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
                return SchedulingHost::fromJson($json);
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
