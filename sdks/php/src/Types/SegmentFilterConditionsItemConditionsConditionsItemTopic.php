<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SegmentFilterConditionsItemConditionsConditionsItemTopic extends JsonSerializableType
{
    /**
     * @var value-of<SegmentFilterConditionsItemConditionsConditionsItemTopicOp> $op Whether emails about the topic reach the contact.
     */
    #[JsonProperty('op')]
    public string $op;

    /**
     * @var string $topic The topic's key.
     */
    #[JsonProperty('topic')]
    public string $topic;

    /**
     * @param array{
     *   op: value-of<SegmentFilterConditionsItemConditionsConditionsItemTopicOp>,
     *   topic: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->op = $values['op'];
        $this->topic = $values['topic'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
