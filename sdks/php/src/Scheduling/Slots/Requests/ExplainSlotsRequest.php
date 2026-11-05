<?php

namespace Coss\Scheduling\Slots\Requests;

use Coss\Core\Json\JsonSerializableType;

class ExplainSlotsRequest extends JsonSerializableType
{
    /**
     * @var string $start An ISO 8601 instant with an offset.
     */
    public string $start;

    /**
     * @var ?string $host Only this host (id or uid).
     */
    public ?string $host;

    /**
     * @var ?int $durationMinutes
     */
    public ?int $durationMinutes;

    /**
     * @var ?string $attributes A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
     */
    public ?string $attributes;

    /**
     * @param array{
     *   start: string,
     *   host?: ?string,
     *   durationMinutes?: ?int,
     *   attributes?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->start = $values['start'];
        $this->host = $values['host'] ?? null;
        if (array_key_exists('host', $values)) {
            $this->_setField('host');
        }
        $this->durationMinutes = $values['durationMinutes'] ?? null;
        if (array_key_exists('durationMinutes', $values)) {
            $this->_setField('durationMinutes');
        }
        $this->attributes = $values['attributes'] ?? null;
        if (array_key_exists('attributes', $values)) {
            $this->_setField('attributes');
        }
    }
}
