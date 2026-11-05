<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SegmentFilterConditionsItemAudienceId extends JsonSerializableType
{
    /**
     * @var value-of<SegmentFilterConditionsItemAudienceIdField> $field
     */
    #[JsonProperty('field')]
    public string $field;

    /**
     * @var value-of<SegmentFilterConditionsItemAudienceIdOp> $op Whether the contact is in the audience.
     */
    #[JsonProperty('op')]
    public string $op;

    /**
     * @var string $audienceId The audience's id.
     */
    #[JsonProperty('audience_id')]
    public string $audienceId;

    /**
     * @param array{
     *   field: value-of<SegmentFilterConditionsItemAudienceIdField>,
     *   op: value-of<SegmentFilterConditionsItemAudienceIdOp>,
     *   audienceId: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->field = $values['field'];
        $this->op = $values['op'];
        $this->audienceId = $values['audienceId'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
