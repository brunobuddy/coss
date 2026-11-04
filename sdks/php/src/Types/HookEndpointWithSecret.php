<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class HookEndpointWithSecret extends JsonSerializableType
{
    /**
     * @var value-of<HookEndpointWithSecretObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $applicationId The id of the application it belongs to.
     */
    #[JsonProperty('application_id')]
    public string $applicationId;

    /**
     * @var string $url Where deliveries are sent.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var ?string $description Your note about it. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var array<string> $filterTypes Only these event types are delivered. Empty: every type.
     */
    #[JsonProperty('filter_types'), ArrayType(['string'])]
    public array $filterTypes;

    /**
     * @var ?int $rateLimitPerSecond At most this many requests per second to this endpoint. `null`: no limit of its own.
     */
    #[JsonProperty('rate_limit_per_second')]
    public ?int $rateLimitPerSecond;

    /**
     * @var bool $enabled Whether new messages are delivered to it.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var ?value-of<HookEndpointWithSecretDisabledReason> $disabledReason `manual`: disabled by you or its user. `failing`: its deliveries failed every attempt for five days, so coss.com disabled it. `null` while enabled.
     */
    #[JsonProperty('disabled_reason')]
    public ?string $disabledReason;

    /**
     * @var ?DateTime $disabledAt When it was disabled. `null`: it's enabled.
     */
    #[JsonProperty('disabled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $disabledAt;

    /**
     * @var ?DateTime $failingSince When its current run of failed deliveries began; cleared by the next success. `null` while healthy.
     */
    #[JsonProperty('failing_since'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $failingSince;

    /**
     * @var ?DateTime $previousSecretExpiresAt After a secret roll, requests are also signed with the previous secret until then.
     */
    #[JsonProperty('previous_secret_expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $previousSecretExpiresAt;

    /**
     * @var array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public array $metadata;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @var string $secret The endpoint's `whsec_…` signing secret (Standard Webhooks).
     */
    #[JsonProperty('secret')]
    public string $secret;

    /**
     * @param array{
     *   object: value-of<HookEndpointWithSecretObject>,
     *   id: string,
     *   applicationId: string,
     *   url: string,
     *   filterTypes: array<string>,
     *   enabled: bool,
     *   metadata: array<string, string>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   secret: string,
     *   description?: ?string,
     *   rateLimitPerSecond?: ?int,
     *   disabledReason?: ?value-of<HookEndpointWithSecretDisabledReason>,
     *   disabledAt?: ?DateTime,
     *   failingSince?: ?DateTime,
     *   previousSecretExpiresAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->applicationId = $values['applicationId'];
        $this->url = $values['url'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->filterTypes = $values['filterTypes'];
        $this->rateLimitPerSecond = $values['rateLimitPerSecond'] ?? null;
        if (array_key_exists('rateLimitPerSecond', $values)) {
            $this->_setField('rateLimitPerSecond');
        }
        $this->enabled = $values['enabled'];
        $this->disabledReason = $values['disabledReason'] ?? null;
        if (array_key_exists('disabledReason', $values)) {
            $this->_setField('disabledReason');
        }
        $this->disabledAt = $values['disabledAt'] ?? null;
        if (array_key_exists('disabledAt', $values)) {
            $this->_setField('disabledAt');
        }
        $this->failingSince = $values['failingSince'] ?? null;
        if (array_key_exists('failingSince', $values)) {
            $this->_setField('failingSince');
        }
        $this->previousSecretExpiresAt = $values['previousSecretExpiresAt'] ?? null;
        if (array_key_exists('previousSecretExpiresAt', $values)) {
            $this->_setField('previousSecretExpiresAt');
        }
        $this->metadata = $values['metadata'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
        $this->secret = $values['secret'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
