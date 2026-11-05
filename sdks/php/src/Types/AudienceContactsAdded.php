<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class AudienceContactsAdded extends JsonSerializableType
{
    /**
     * @var value-of<AudienceContactsAddedObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var int $added Contacts newly added.
     */
    #[JsonProperty('added')]
    public int $added;

    /**
     * @var int $existing Contacts that were already members.
     */
    #[JsonProperty('existing')]
    public int $existing;

    /**
     * @var array<string> $missing Ids or addresses of no contact.
     */
    #[JsonProperty('missing'), ArrayType(['string'])]
    public array $missing;

    /**
     * @param array{
     *   object: value-of<AudienceContactsAddedObject>,
     *   added: int,
     *   existing: int,
     *   missing: array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->added = $values['added'];
        $this->existing = $values['existing'];
        $this->missing = $values['missing'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
