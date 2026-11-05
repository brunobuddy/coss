<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class WebhookEndpointWithSecret extends JsonSerializableType
{
    /**
     * @var value-of<WebhookEndpointWithSecretObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $url Where events are posted.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var ?string $description Your note about it. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var array<string> $eventTypes Event types delivered to this endpoint. An empty array means every event type, including ones added later.
     */
    #[JsonProperty('event_types'), ArrayType(['string'])]
    public array $eventTypes;

    /**
     * @var string $apiVersion The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`.
     */
    #[JsonProperty('api_version')]
    public string $apiVersion;

    /**
     * @var bool $enabled A disabled endpoint receives nothing until it is enabled again.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var ?value-of<WebhookEndpointWithSecretDisabledReason> $disabledReason `manual`: someone disabled it. `failing`: its deliveries failed every attempt for five days, so coss.com disabled it. `null` while enabled.
     */
    #[JsonProperty('disabled_reason')]
    public ?string $disabledReason;

    /**
     * @var ?DateTime $disabledAt When it was disabled. `null` while enabled.
     */
    #[JsonProperty('disabled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $disabledAt;

    /**
     * @var ?DateTime $failingSince When the endpoint's current run of failed deliveries began (a delivery that failed every attempt); cleared by the next successful delivery. An endpoint failing for five days is disabled. `null` while healthy.
     */
    #[JsonProperty('failing_since'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $failingSince;

    /**
     * @var ?DateTime $previousSecretExpiresAt After a secret roll, deliveries are also signed with the previous secret until this time. `null` when only the current secret signs.
     */
    #[JsonProperty('previous_secret_expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $previousSecretExpiresAt;

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
     * @var string $secret The endpoint's `whsec_…` signing secret, used to verify the requests coss.com sends. Returned only when the endpoint is created and when its secret is rolled — store it now; it cannot be read back through the API.
     */
    #[JsonProperty('secret')]
    public string $secret;

    /**
     * @param array{
     *   object: value-of<WebhookEndpointWithSecretObject>,
     *   id: string,
     *   url: string,
     *   eventTypes: array<string>,
     *   apiVersion: string,
     *   enabled: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   secret: string,
     *   description?: ?string,
     *   disabledReason?: ?value-of<WebhookEndpointWithSecretDisabledReason>,
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
        $this->url = $values['url'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->eventTypes = $values['eventTypes'];
        $this->apiVersion = $values['apiVersion'];
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
