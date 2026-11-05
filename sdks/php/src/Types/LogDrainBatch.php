<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class LogDrainBatch extends JsonSerializableType
{
    /**
     * @var value-of<LogDrainBatchObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id The batch's id: the `webhook-id` header, the same on every attempt.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $drainId The id of the drain it's posted to.
     */
    #[JsonProperty('drain_id')]
    public string $drainId;

    /**
     * @var value-of<LogDrainBatchStatus> $status
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var int $lineCount Lines in the batch.
     */
    #[JsonProperty('line_count')]
    public int $lineCount;

    /**
     * @var int $byteSize Size of the request body in bytes.
     */
    #[JsonProperty('byte_size')]
    public int $byteSize;

    /**
     * @var int $attemptCount How many attempts were made so far.
     */
    #[JsonProperty('attempt_count')]
    public int $attemptCount;

    /**
     * @var ?DateTime $nextAttemptAt When the next attempt is due; `null` once the batch is finished.
     */
    #[JsonProperty('next_attempt_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $nextAttemptAt;

    /**
     * @var ?int $lastStatusCode The drain's HTTP status on the latest attempt. `null`: no response arrived, or no attempt yet.
     */
    #[JsonProperty('last_status_code')]
    public ?int $lastStatusCode;

    /**
     * @var ?string $lastError Why the latest attempt failed. `null`: it didn't, or no attempt yet.
     */
    #[JsonProperty('last_error')]
    public ?string $lastError;

    /**
     * @var array<LogDrainAttempt> $attempts Every HTTP attempt of this batch, oldest first.
     */
    #[JsonProperty('attempts'), ArrayType([LogDrainAttempt::class])]
    public array $attempts;

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
     * @param array{
     *   object: value-of<LogDrainBatchObject>,
     *   id: string,
     *   drainId: string,
     *   status: value-of<LogDrainBatchStatus>,
     *   lineCount: int,
     *   byteSize: int,
     *   attemptCount: int,
     *   attempts: array<LogDrainAttempt>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   nextAttemptAt?: ?DateTime,
     *   lastStatusCode?: ?int,
     *   lastError?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->drainId = $values['drainId'];
        $this->status = $values['status'];
        $this->lineCount = $values['lineCount'];
        $this->byteSize = $values['byteSize'];
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
        $this->attempts = $values['attempts'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
