<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

/**
 * Only for bookings matching all of this. `null`: every booking.
 */
class SchedulingReminderOnlyIf extends JsonSerializableType
{
    /**
     * @var ?array<string, ?string> $metadata The booking's metadata must have all of these. `null`: any.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => new Union('string', 'null')])]
    public ?array $metadata;

    /**
     * @var ?array<string> $locationTypes The booking's location must be one of these. `null`: any.
     */
    #[JsonProperty('location_types'), ArrayType(['string'])]
    public ?array $locationTypes;

    /**
     * @param array{
     *   metadata?: ?array<string, ?string>,
     *   locationTypes?: ?array<string>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->locationTypes = $values['locationTypes'] ?? null;
        if (array_key_exists('locationTypes', $values)) {
            $this->_setField('locationTypes');
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
