<?php

namespace Coss\Email\Suppressions;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Email\Suppressions\Requests\ListSuppressionsRequest;
use Coss\Types\SuppressionList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Email\Suppressions\Requests\CreateSuppressionRequest;
use Coss\Types\Suppression;
use Coss\Core\Client\IdempotencyKey;
use Coss\Email\Suppressions\Requests\CheckSuppressionsRequest;
use Coss\Types\SuppressionCheck;
use Coss\Email\Suppressions\Requests\ImportSuppressionsRequest;
use Coss\Types\SuppressionImport;
use Coss\Email\Suppressions\Requests\ExportSuppressionsRequest;
use Coss\Types\DeletedSuppression;

class SuppressionsClient
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
     * The suppression list of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
     *
     * Example:
     * ```php
     * $client->email->suppressions->list(
     *     new ListSuppressionsRequest([
     *         'subaccount' => 'user_8812',
     *     ]),
     * );
     * ```
     *
     * @param ListSuppressionsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SuppressionList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(ListSuppressionsRequest $request = new ListSuppressionsRequest(), ?array $options = null): ?SuppressionList
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        if ($request->subaccount != null) {
            $query['subaccount'] = $request->subaccount;
        }
        if ($request->address != null) {
            $query['address'] = $request->address;
        }
        if ($request->scope != null) {
            $query['scope'] = $request->scope;
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
                    path: "v1/suppressions",
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
                return SuppressionList::fromJson($json);
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
     * Suppresses an address in the API key's environment: later sends skip it, either for every email (`scope: "*"`, the default) or only for emails with the given `category` (e.g. to back an unsubscribe link). Adding an address that is already suppressed with the same scope returns the existing entry with status 200.
     *
     * Example:
     * ```php
     * $client->email->suppressions->add(
     *     new CreateSuppressionRequest([
     *         'address' => 'user@example.com',
     *         'scope' => 'marketing',
     *     ]),
     * );
     * ```
     *
     * @param CreateSuppressionRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?Suppression
     * @throws CossException
     * @throws CossApiException
     */
    public function add(CreateSuppressionRequest $request, ?array $options = null): ?Suppression
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions",
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
                return Suppression::fromJson($json);
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
     * Whether a send to `address` (with `category`, if given) would skip it, and the entries that match: those with scope `*` and, with a `category`, those for that category.
     *
     * Example:
     * ```php
     * $client->email->suppressions->check(
     *     new CheckSuppressionsRequest([
     *         'address' => 'user@example.com',
     *     ]),
     * );
     * ```
     *
     * @param CheckSuppressionsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SuppressionCheck
     * @throws CossException
     * @throws CossApiException
     */
    public function check(CheckSuppressionsRequest $request, ?array $options = null): ?SuppressionCheck
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        $query['address'] = $request->address;
        if ($request->category != null) {
            $query['category'] = $request->category;
        }
        if ($request->stream != null) {
            $query['stream'] = $request->stream;
        }
        if ($request->subaccount != null) {
            $query['subaccount'] = $request->subaccount;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions/check",
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
                return SuppressionCheck::fromJson($json);
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
     * Adds up to 1000 entries at once, with reason `import`. Each entry is validated on its own: invalid ones are skipped and listed in `invalid`, entries already on the list are left unchanged and counted in `existing`. Importing again is safe.
     *
     * Example:
     * ```php
     * $client->email->suppressions->import(
     *     new ImportSuppressionsRequest([
     *         'suppressions' => [
     *             new ImportSuppressionsRequestSuppressionsItem([
     *                 'address' => 'user@example.com',
     *             ]),
     *             new ImportSuppressionsRequestSuppressionsItem([
     *                 'address' => 'other@example.com',
     *                 'scope' => 'marketing',
     *             ]),
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param ImportSuppressionsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SuppressionImport
     * @throws CossException
     * @throws CossApiException
     */
    public function import(ImportSuppressionsRequest $request, ?array $options = null): ?SuppressionImport
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions/import",
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
                return SuppressionImport::fromJson($json);
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
     * The whole suppression list of the API key's environment (optionally filtered), oldest first, as CSV with the columns `address,scope,reason,created_at,email_id,id`. The file can be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.
     *
     * Example:
     * ```php
     * $client->email->suppressions->export(
     *     new ExportSuppressionsRequest([]),
     * );
     * ```
     *
     * @param ExportSuppressionsRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return string
     * @throws CossException
     * @throws CossApiException
     */
    public function export(ExportSuppressionsRequest $request = new ExportSuppressionsRequest(), ?array $options = null): string
    {
        $options = array_merge($this->options, $options ?? []);
        $query = [];
        if ($request->subaccount != null) {
            $query['subaccount'] = $request->subaccount;
        }
        if ($request->scope != null) {
            $query['scope'] = $request->scope;
        }
        if ($request->reason != null) {
            $query['reason'] = $request->reason;
        }
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions/export",
                    method: HttpMethod::GET,
                    query: $query,
                ),
                $options,
            );
            $statusCode = $response->getStatusCode();
            if ($statusCode >= 200 && $statusCode < 400) {
                return $response->getBody()->getContents();
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

    /**
     * One entry of the suppression list of the API key's environment.
     *
     * Example:
     * ```php
     * $client->email->suppressions->get(
     *     'sup_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The suppression's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?Suppression
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $id, ?array $options = null): ?Suppression
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions/" . RawClient::encodePathParam($id),
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
                return Suppression::fromJson($json);
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
     * Removes the entry, so later sends reach the address again (unless another entry still matches). Entries added for bounces and complaints can be removed too.
     *
     * Example:
     * ```php
     * $client->email->suppressions->remove(
     *     'sup_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The suppression's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?DeletedSuppression
     * @throws CossException
     * @throws CossApiException
     */
    public function remove(string $id, ?array $options = null): ?DeletedSuppression
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/suppressions/" . RawClient::encodePathParam($id),
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
                return DeletedSuppression::fromJson($json);
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
