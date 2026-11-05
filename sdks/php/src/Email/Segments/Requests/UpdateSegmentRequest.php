<?php

namespace Coss\Email\Segments\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\SegmentFilter;

class UpdateSegmentRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Your name for the segment, unique in the environment.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?SegmentFilter $filter
     */
    #[JsonProperty('filter')]
    public ?SegmentFilter $filter;

    /**
     * @param array{
     *   name?: ?string,
     *   filter?: ?SegmentFilter,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->filter = $values['filter'] ?? null;
        if (array_key_exists('filter', $values)) {
            $this->_setField('filter');
        }
    }
}
