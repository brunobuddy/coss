<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSeriesPreview extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSeriesPreviewObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var array<SchedulingSeriesPreviewDataItem> $data Each occurrence the request would book. Nothing is booked.
     */
    #[JsonProperty('data'), ArrayType([SchedulingSeriesPreviewDataItem::class])]
    public array $data;

    /**
     * @var bool $hasMore
     */
    #[JsonProperty('has_more')]
    public bool $hasMore;

    /**
     * @param array{
     *   object: value-of<SchedulingSeriesPreviewObject>,
     *   data: array<SchedulingSeriesPreviewDataItem>,
     *   hasMore: bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->data = $values['data'];
        $this->hasMore = $values['hasMore'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
