<?php

namespace Coss\Sign\Templates;

use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;
use Coss\Sign\Templates\Requests\ListTemplatesRequest;
use Coss\Types\SignTemplateList;
use Coss\Exceptions\CossException;
use Coss\Exceptions\CossApiException;
use Coss\Core\Json\JsonApiRequest;
use Coss\Environments;
use Coss\Core\Client\HttpMethod;
use JsonException;
use Psr\Http\Client\ClientExceptionInterface;
use Coss\Sign\Templates\Requests\CreateSignTemplateRequest;
use Coss\Types\SignTemplate;
use Coss\Core\Client\IdempotencyKey;
use Coss\Types\DeletedSignTemplate;
use Coss\Sign\Templates\Requests\UpdateSignTemplateRequest;
use Coss\Sign\Templates\Requests\CreateSignRequestFromTemplateRequest;
use Coss\Types\SignRequest;
use Coss\Sign\Templates\Requests\CreateSignBuilderSessionRequest;
use Coss\Types\SignBuilderSession;

class TemplatesClient
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
     * Newest first. Pass the last `id` as `after` while `has_more` is true.
     *
     * Example:
     * ```php
     * $client->sign->templates->list(
     *     new ListTemplatesRequest([]),
     * );
     * ```
     *
     * @param ListTemplatesRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignTemplateList
     * @throws CossException
     * @throws CossApiException
     */
    public function list(ListTemplatesRequest $request = new ListTemplatesRequest(), ?array $options = null): ?SignTemplateList
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
                    path: "v1/sign/templates",
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
                return SignTemplateList::fromJson($json);
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
     * Documents with fields for roles (`client`, `company`) instead of named signers, made into requests by naming a signer per role. Fields by position or text anchor (resolved now). Can start empty and be built in the embedded builder (create a builder session).
     *
     * Example:
     * ```php
     * $client->sign->templates->create(
     *     new CreateSignTemplateRequest([
     *         'name' => 'Mutual NDA',
     *         'documents' => [
     *             new CreateSignTemplateRequestDocumentsItemDocumentId([
     *                 'documentId' => 'sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz',
     *             ]),
     *         ],
     *         'roles' => [
     *             new CreateSignTemplateRequestRolesItem([
     *                 'key' => 'client',
     *                 'name' => 'Client',
     *             ]),
     *             new CreateSignTemplateRequestRolesItem([
     *                 'key' => 'company',
     *                 'name' => 'Company',
     *             ]),
     *         ],
     *         'fields' => [
     *             new CreateSignTemplateRequestFieldsItemDocument([
     *                 'type' => CreateSignTemplateRequestFieldsItemDocumentType::Signature->value,
     *                 'role' => 'client',
     *                 'page' => 1,
     *                 'x' => 1,
     *                 'y' => 1,
     *                 'width' => 1,
     *                 'height' => 1,
     *             ]),
     *             new CreateSignTemplateRequestFieldsItemDocument([
     *                 'type' => CreateSignTemplateRequestFieldsItemDocumentType::Text->value,
     *                 'page' => 1,
     *                 'x' => 72,
     *                 'y' => 140,
     *                 'width' => 200,
     *                 'height' => 18,
     *                 'role' => 'client',
     *                 'mergeKey' => 'client_company',
     *             ]),
     *             new CreateSignTemplateRequestFieldsItemDocument([
     *                 'type' => CreateSignTemplateRequestFieldsItemDocumentType::Signature->value,
     *                 'role' => 'company',
     *                 'page' => 1,
     *                 'x' => 1,
     *                 'y' => 1,
     *                 'width' => 1,
     *                 'height' => 1,
     *             ]),
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param CreateSignTemplateRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignTemplate
     * @throws CossException
     * @throws CossApiException
     */
    public function create(CreateSignTemplateRequest $request, ?array $options = null): ?SignTemplate
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sign/templates",
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
                return SignTemplate::fromJson($json);
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
     * A template with its documents, roles and fields. `ready` says whether requests can be made from it.
     *
     * Example:
     * ```php
     * $client->sign->templates->get(
     *     'stpl_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The template's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignTemplate
     * @throws CossException
     * @throws CossApiException
     */
    public function get(string $id, ?array $options = null): ?SignTemplate
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sign/templates/" . RawClient::encodePathParam($id),
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
                return SignTemplate::fromJson($json);
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
     * Requests made from it, and its documents, stay.
     *
     * Example:
     * ```php
     * $client->sign->templates->remove(
     *     'stpl_01k7c8m4q2f3e9v6t5r1n0p8yz',
     * );
     * ```
     *
     * @param string $id The template's id.
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?DeletedSignTemplate
     * @throws CossException
     * @throws CossApiException
     */
    public function remove(string $id, ?array $options = null): ?DeletedSignTemplate
    {
        $options = array_merge($this->options, $options ?? []);
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sign/templates/" . RawClient::encodePathParam($id),
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
                return DeletedSignTemplate::fromJson($json);
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
     * Changes the fields given. `documents`, `roles` and `fields` each replace the whole list. Requests already made from it don't change.
     *
     * Example:
     * ```php
     * $client->sign->templates->update(
     *     'stpl_01k7c8m4q2f3e9v6t5r1n0p8yz',
     *     new UpdateSignTemplateRequest([
     *         'name' => 'Mutual NDA (2026)',
     *     ]),
     * );
     * ```
     *
     * @param string $id The template's id.
     * @param UpdateSignTemplateRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignTemplate
     * @throws CossException
     * @throws CossApiException
     */
    public function update(string $id, UpdateSignTemplateRequest $request = new UpdateSignTemplateRequest(), ?array $options = null): ?SignTemplate
    {
        $options = array_merge($this->options, $options ?? []);
        $options['maxRetries'] = 0;
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sign/templates/" . RawClient::encodePathParam($id),
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
                return SignTemplate::fromJson($json);
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
     * A signature request with the template's documents and fields: name one signer for each role, and give its merge fields' values. Like creating a request, it is sent at once unless `send` is `false`, and an `Idempotency-Key` makes retries safe.
     *
     * Example:
     * ```php
     * $client->sign->templates->createRequest(
     *     'stpl_01k7c8m4q2f3e9v6t5r1n0p8yz',
     *     new CreateSignRequestFromTemplateRequest([
     *         'idempotencyKey' => 'welcome-user-123',
     *         'signers' => [
     *             new CreateSignRequestFromTemplateRequestSignersItem([
     *                 'role' => 'client',
     *                 'name' => 'Ada Lovelace',
     *                 'email' => 'ada@example.com',
     *             ]),
     *             new CreateSignRequestFromTemplateRequestSignersItem([
     *                 'role' => 'company',
     *                 'name' => 'Grace Hopper',
     *                 'email' => 'grace@acme.com',
     *                 'delivery' => CreateSignRequestFromTemplateRequestSignersItemDelivery::Embedded->value,
     *             ]),
     *         ],
     *         'mergeFields' => [
     *             'client_company' => 'Analytical Engines Ltd',
     *         ],
     *     ]),
     * );
     * ```
     *
     * @param string $id The template's id.
     * @param CreateSignRequestFromTemplateRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignRequest
     * @throws CossException
     * @throws CossApiException
     */
    public function createRequest(string $id, CreateSignRequestFromTemplateRequest $request, ?array $options = null): ?SignRequest
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
                    path: "v1/sign/templates/" . RawClient::encodePathParam($id) . "/requests",
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
                return SignRequest::fromJson($json);
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
     * A short-lived link to the embedded builder for this template: upload documents, add roles, and drag fields onto pages. Embed it with `mountBuilder` from `coss/sign` (from an origin in your Sign settings' `allowed_origins`) for whoever edits the template.
     *
     * Example:
     * ```php
     * $client->sign->templates->createBuilderSession(
     *     'stpl_01k7c8m4q2f3e9v6t5r1n0p8yz',
     *     new CreateSignBuilderSessionRequest([
     *         'expiresIn' => 3600,
     *     ]),
     * );
     * ```
     *
     * @param string $id The template's id.
     * @param CreateSignBuilderSessionRequest $request
     * @param ?array{
     *   baseUrl?: string,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     *   queryParameters?: array<string, mixed>,
     *   bodyProperties?: array<string, mixed>,
     * } $options
     * @return ?SignBuilderSession
     * @throws CossException
     * @throws CossApiException
     */
    public function createBuilderSession(string $id, CreateSignBuilderSessionRequest $request = new CreateSignBuilderSessionRequest(), ?array $options = null): ?SignBuilderSession
    {
        $options = array_merge($this->options, $options ?? []);
        $headers = [];
        $headers['Idempotency-Key'] ??= IdempotencyKey::generate();
        try {
            $response = $this->client->sendRequest(
                new JsonApiRequest(
                    baseUrl: $options['baseUrl'] ?? $this->client->options['baseUrl'] ?? Environments::Default_->value,
                    path: "v1/sign/templates/" . RawClient::encodePathParam($id) . "/builder_sessions",
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
                return SignBuilderSession::fromJson($json);
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
