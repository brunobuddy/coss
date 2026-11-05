<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class HookAttempt extends JsonSerializableType
{
    /**
     * @var value-of<HookAttemptObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $deliveryId The id of the delivery this attempt belongs to.
     */
    #[JsonProperty('delivery_id')]
    public string $deliveryId;

    /**
     * @var string $endpointId The id of the endpoint it was sent to.
     */
    #[JsonProperty('endpoint_id')]
    public string $endpointId;

    /**
     * @var DateTime $attemptedAt When the attempt ran.
     */
    #[JsonProperty('attempted_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $attemptedAt;

    /**
     * @var ?int $statusCode The endpoint's HTTP status; `null` when no response arrived.
     */
    #[JsonProperty('status_code')]
    public ?int $statusCode;

    /**
     * @var int $durationMs How long it took, in milliseconds.
     */
    #[JsonProperty('duration_ms')]
    public int $durationMs;

    /**
     * @var ?string $error Why it failed. `null`: it didn't.
     */
    #[JsonProperty('error')]
    public ?string $error;

    /**
     * @var ?string $responseExcerpt At most 1 KB of the response body, as text.
     */
    #[JsonProperty('response_excerpt')]
    public ?string $responseExcerpt;

    /**
     * @param array{
     *   object: value-of<HookAttemptObject>,
     *   id: string,
     *   deliveryId: string,
     *   endpointId: string,
     *   attemptedAt: DateTime,
     *   durationMs: int,
     *   statusCode?: ?int,
     *   error?: ?string,
     *   responseExcerpt?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->deliveryId = $values['deliveryId'];
        $this->endpointId = $values['endpointId'];
        $this->attemptedAt = $values['attemptedAt'];
        $this->statusCode = $values['statusCode'] ?? null;
        if (array_key_exists('statusCode', $values)) {
            $this->_setField('statusCode');
        }
        $this->durationMs = $values['durationMs'];
        $this->error = $values['error'] ?? null;
        if (array_key_exists('error', $values)) {
            $this->_setField('error');
        }
        $this->responseExcerpt = $values['responseExcerpt'] ?? null;
        if (array_key_exists('responseExcerpt', $values)) {
            $this->_setField('responseExcerpt');
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
