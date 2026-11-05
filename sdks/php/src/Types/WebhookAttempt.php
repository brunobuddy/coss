<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class WebhookAttempt extends JsonSerializableType
{
    /**
     * @var value-of<WebhookAttemptObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

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
     * @var ?string $error Why the attempt failed (e.g. `HTTP 500`, a timeout); `null` on success.
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
     *   object: value-of<WebhookAttemptObject>,
     *   id: string,
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
