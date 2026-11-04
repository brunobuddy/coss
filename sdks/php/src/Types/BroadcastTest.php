<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class BroadcastTest extends JsonSerializableType
{
    /**
     * @var value-of<BroadcastTestObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var array<string> $emailIds The ids of the test emails.
     */
    #[JsonProperty('email_ids'), ArrayType(['string'])]
    public array $emailIds;

    /**
     * @param array{
     *   object: value-of<BroadcastTestObject>,
     *   emailIds: array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->emailIds = $values['emailIds'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
