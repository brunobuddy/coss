<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class Log extends JsonSerializableType
{
    /**
     * @var value-of<LogObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var value-of<LogSource> $source
     */
    #[JsonProperty('source')]
    public string $source;

    /**
     * @var value-of<LogLevel> $level
     */
    #[JsonProperty('level')]
    public string $level;

    /**
     * @var string $type `api.request`, `webhook.attempt`, `webhook.forward` (an event `coss listen` forwarded), or an email event type such as `email.delivered`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $message A one-line summary.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @var ?string $requestId The `X-Request-Id` of the API request this line belongs to.
     */
    #[JsonProperty('request_id')]
    public ?string $requestId;

    /**
     * @var ?string $apiKeyId The API key that made the request. `null`: not an API request.
     */
    #[JsonProperty('api_key_id')]
    public ?string $apiKeyId;

    /**
     * @var ?string $method The HTTP method. `null`: not an HTTP line.
     */
    #[JsonProperty('method')]
    public ?string $method;

    /**
     * @var ?string $path The request's path. `null`: not an API request.
     */
    #[JsonProperty('path')]
    public ?string $path;

    /**
     * @var ?string $route The matched route, e.g. `/v1/emails/:id`.
     */
    #[JsonProperty('route')]
    public ?string $route;

    /**
     * @var ?int $statusCode The API response status, or the webhook endpoint's response status.
     */
    #[JsonProperty('status_code')]
    public ?int $statusCode;

    /**
     * @var ?int $durationMs How long it took, in milliseconds. `null`: not timed.
     */
    #[JsonProperty('duration_ms')]
    public ?int $durationMs;

    /**
     * @var ?string $clientIp The caller's address. `null`: not an API request.
     */
    #[JsonProperty('client_ip')]
    public ?string $clientIp;

    /**
     * @var ?string $userAgent The caller's `User-Agent`. `null`: not sent.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @var ?string $errorCode The error's `code`. `null`: no error.
     */
    #[JsonProperty('error_code')]
    public ?string $errorCode;

    /**
     * @var ?string $resourceType What the line is about: `email`, `domain`, `webhook_endpoint`…
     */
    #[JsonProperty('resource_type')]
    public ?string $resourceType;

    /**
     * @var ?string $resourceId The id of what it's about. `null`: nothing in particular.
     */
    #[JsonProperty('resource_id')]
    public ?string $resourceId;

    /**
     * @var ?string $recipient The recipient an email event is about. `null`: none.
     */
    #[JsonProperty('recipient')]
    public ?string $recipient;

    /**
     * @var array<string, mixed> $attributes Details: redacted request and response bodies for API requests (secrets, attachment contents and long strings are never stored), event data for emails and webhooks.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => 'mixed'])]
    public array $attributes;

    /**
     * @param array{
     *   object: value-of<LogObject>,
     *   id: string,
     *   occurredAt: DateTime,
     *   source: value-of<LogSource>,
     *   level: value-of<LogLevel>,
     *   type: string,
     *   message: string,
     *   attributes: array<string, mixed>,
     *   requestId?: ?string,
     *   apiKeyId?: ?string,
     *   method?: ?string,
     *   path?: ?string,
     *   route?: ?string,
     *   statusCode?: ?int,
     *   durationMs?: ?int,
     *   clientIp?: ?string,
     *   userAgent?: ?string,
     *   errorCode?: ?string,
     *   resourceType?: ?string,
     *   resourceId?: ?string,
     *   recipient?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->occurredAt = $values['occurredAt'];
        $this->source = $values['source'];
        $this->level = $values['level'];
        $this->type = $values['type'];
        $this->message = $values['message'];
        $this->requestId = $values['requestId'] ?? null;
        if (array_key_exists('requestId', $values)) {
            $this->_setField('requestId');
        }
        $this->apiKeyId = $values['apiKeyId'] ?? null;
        if (array_key_exists('apiKeyId', $values)) {
            $this->_setField('apiKeyId');
        }
        $this->method = $values['method'] ?? null;
        if (array_key_exists('method', $values)) {
            $this->_setField('method');
        }
        $this->path = $values['path'] ?? null;
        if (array_key_exists('path', $values)) {
            $this->_setField('path');
        }
        $this->route = $values['route'] ?? null;
        if (array_key_exists('route', $values)) {
            $this->_setField('route');
        }
        $this->statusCode = $values['statusCode'] ?? null;
        if (array_key_exists('statusCode', $values)) {
            $this->_setField('statusCode');
        }
        $this->durationMs = $values['durationMs'] ?? null;
        if (array_key_exists('durationMs', $values)) {
            $this->_setField('durationMs');
        }
        $this->clientIp = $values['clientIp'] ?? null;
        if (array_key_exists('clientIp', $values)) {
            $this->_setField('clientIp');
        }
        $this->userAgent = $values['userAgent'] ?? null;
        if (array_key_exists('userAgent', $values)) {
            $this->_setField('userAgent');
        }
        $this->errorCode = $values['errorCode'] ?? null;
        if (array_key_exists('errorCode', $values)) {
            $this->_setField('errorCode');
        }
        $this->resourceType = $values['resourceType'] ?? null;
        if (array_key_exists('resourceType', $values)) {
            $this->_setField('resourceType');
        }
        $this->resourceId = $values['resourceId'] ?? null;
        if (array_key_exists('resourceId', $values)) {
            $this->_setField('resourceId');
        }
        $this->recipient = $values['recipient'] ?? null;
        if (array_key_exists('recipient', $values)) {
            $this->_setField('recipient');
        }
        $this->attributes = $values['attributes'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
