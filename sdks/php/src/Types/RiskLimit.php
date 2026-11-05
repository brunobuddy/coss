<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RiskLimit extends JsonSerializableType
{
    /**
     * @var value-of<RiskLimitObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $bucket The bucket's name.
     */
    #[JsonProperty('bucket')]
    public string $bucket;

    /**
     * @var bool $allowed Whether to let the request through. Denied requests take no tokens.
     */
    #[JsonProperty('allowed')]
    public bool $allowed;

    /**
     * @var int $limit The bucket's size (`burst`).
     */
    #[JsonProperty('limit')]
    public int $limit;

    /**
     * @var int $remaining Tokens left for this key.
     */
    #[JsonProperty('remaining')]
    public int $remaining;

    /**
     * @var int $resetMs Milliseconds until the key's bucket is full again.
     */
    #[JsonProperty('reset_ms')]
    public int $resetMs;

    /**
     * @var ?int $retryAfterMs When denied: milliseconds until the same request would be allowed; `null` when it never would (`cost` above the bucket's size). 0 when allowed.
     */
    #[JsonProperty('retry_after_ms')]
    public ?int $retryAfterMs;

    /**
     * @var bool $degraded coss.com couldn't count (its store was unavailable): `allowed` is the bucket's `on_failure`.
     */
    #[JsonProperty('degraded')]
    public bool $degraded;

    /**
     * @param array{
     *   object: value-of<RiskLimitObject>,
     *   bucket: string,
     *   allowed: bool,
     *   limit: int,
     *   remaining: int,
     *   resetMs: int,
     *   degraded: bool,
     *   retryAfterMs?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->bucket = $values['bucket'];
        $this->allowed = $values['allowed'];
        $this->limit = $values['limit'];
        $this->remaining = $values['remaining'];
        $this->resetMs = $values['resetMs'];
        $this->retryAfterMs = $values['retryAfterMs'] ?? null;
        if (array_key_exists('retryAfterMs', $values)) {
            $this->_setField('retryAfterMs');
        }
        $this->degraded = $values['degraded'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
