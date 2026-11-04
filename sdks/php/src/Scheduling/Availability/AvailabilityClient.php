<?php

namespace Coss\Scheduling\Availability;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Scheduling\Availability\Requests\AvailabilitySearchRequest;
use Coss\Types\SchedulingAvailabilitySearchResult;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Client\IdempotencyKey;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;

class AvailabilityClient
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
     * For "who's free" pages: each matching host's soonest slots, soonest first, across up to 500 hosts.
     *
     * Example:
     * ```php
     * $client->scheduling->availability->search(
     *     new AvailabilitySearchRequest([
     *         'eventType' => 'evtype_01kd2m9a0b1c2d3e4f5g6h7j8m',
     *         'start' => '2027-01-04T00:00:00.000Z',
     *         'end' => '2027-01-18T00:00:00.000Z',
     *         'attributes' => [
     *             'licensed_in' => 'CA',
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param AvailabilitySearchRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SchedulingAvailabilitySearchResult
     * @throws CossException
     * @throws CossApiException
     */
    public function search(AvailabilitySearchRequest $request, ?array $options = null): ?SchedulingAvailabilitySearchResult
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/scheduling/availability/search",
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
                return SchedulingAvailabilitySearchResult::fromJson($json);
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
