<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who did it.
 */
class SchedulingBookingEventActor extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingEventActorKind> $kind
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var ?string $id The API key, user or session's id. `null` for `system`.
     */
    #[JsonProperty('id')]
    public ?string $id;

    /**
     * @param array{
     *   kind: value-of<SchedulingBookingEventActorKind>,
     *   id?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->kind = $values['kind'];
        $this->id = $values['id'] ?? null;
        if (array_key_exists('id', $values)) {
            $this->_setField('id');
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
