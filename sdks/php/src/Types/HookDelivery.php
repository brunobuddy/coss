<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class HookDelivery extends JsonSerializableType
{
    /**
     * @var value-of<HookDeliveryObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $applicationId The id of the application.
     */
    #[JsonProperty('application_id')]
    public string $applicationId;

    /**
     * @var string $messageId The id of the message being delivered.
     */
    #[JsonProperty('message_id')]
    public string $messageId;

    /**
     * @var string $endpointId The id of the endpoint it's delivered to.
     */
    #[JsonProperty('endpoint_id')]
    public string $endpointId;

    /**
     * @var value-of<HookDeliveryStatus> $status `pending`: waiting for its next attempt. `succeeded`: the endpoint answered 2xx. `failed`: every attempt failed, or the endpoint was disabled or deleted.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var int $attemptCount How many attempts were made so far.
     */
    #[JsonProperty('attempt_count')]
    public int $attemptCount;

    /**
     * @var ?DateTime $nextAttemptAt When the next attempt runs. `null`: none is due, because it finished.
     */
    #[JsonProperty('next_attempt_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $nextAttemptAt;

    /**
     * @var ?int $lastStatusCode The endpoint's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.
     */
    #[JsonProperty('last_status_code')]
    public ?int $lastStatusCode;

    /**
     * @var ?string $lastError Why the latest attempt failed. `null`: it didn't, or no attempt yet.
     */
    #[JsonProperty('last_error')]
    public ?string $lastError;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var ?DateTime $finishedAt When it `succeeded` or `failed`. `null`: still `pending`.
     */
    #[JsonProperty('finished_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $finishedAt;

    /**
     * @param array{
     *   object: value-of<HookDeliveryObject>,
     *   id: string,
     *   applicationId: string,
     *   messageId: string,
     *   endpointId: string,
     *   status: value-of<HookDeliveryStatus>,
     *   attemptCount: int,
     *   createdAt: DateTime,
     *   nextAttemptAt?: ?DateTime,
     *   lastStatusCode?: ?int,
     *   lastError?: ?string,
     *   finishedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->applicationId = $values['applicationId'];
        $this->messageId = $values['messageId'];
        $this->endpointId = $values['endpointId'];
        $this->status = $values['status'];
        $this->attemptCount = $values['attemptCount'];
        $this->nextAttemptAt = $values['nextAttemptAt'] ?? null;
        if (array_key_exists('nextAttemptAt', $values)) {
            $this->_setField('nextAttemptAt');
        }
        $this->lastStatusCode = $values['lastStatusCode'] ?? null;
        if (array_key_exists('lastStatusCode', $values)) {
            $this->_setField('lastStatusCode');
        }
        $this->lastError = $values['lastError'] ?? null;
        if (array_key_exists('lastError', $values)) {
            $this->_setField('lastError');
        }
        $this->createdAt = $values['createdAt'];
        $this->finishedAt = $values['finishedAt'] ?? null;
        if (array_key_exists('finishedAt', $values)) {
            $this->_setField('finishedAt');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
