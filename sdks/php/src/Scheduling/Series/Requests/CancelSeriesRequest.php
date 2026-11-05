<?php

namespace Coss\Scheduling\Series\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CancelSeriesRequest extends JsonSerializableType
{
    /**
     * @var ?int $fromIndex Cancel this occurrence and those after it. Default: all of them.
     */
    #[JsonProperty('from_index')]
    public ?int $fromIndex;

    /**
     * @param array{
     *   fromIndex?: ?int,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->fromIndex = $values['fromIndex'] ?? null;
        if (array_key_exists('fromIndex', $values)) {
            $this->_setField('fromIndex');
        }
    }
}
