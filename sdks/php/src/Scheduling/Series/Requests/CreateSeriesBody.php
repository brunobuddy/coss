<?php

namespace Coss\Scheduling\Series\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\CreateSeriesRequest;

class CreateSeriesBody extends JsonSerializableType
{
    /**
     * @var ?string $idempotencyKey Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
     */
    public ?string $idempotencyKey;

    /**
     * @var CreateSeriesRequest $body
     */
    public CreateSeriesRequest $body;

    /**
     * @param array{
     *   body: CreateSeriesRequest,
     *   idempotencyKey?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->idempotencyKey = $values['idempotencyKey'] ?? null;
        if (array_key_exists('idempotencyKey', $values)) {
            $this->_setField('idempotencyKey');
        }
        $this->body = $values['body'];
    }
}
