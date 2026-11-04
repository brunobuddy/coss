<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * The DNS record to publish, with the result of the last check.
 */
class TrackingDomainRecord extends JsonSerializableType
{
    /**
     * @var value-of<TrackingDomainRecordType> $type The record's type.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $name The fully qualified record name to create.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $value The host the record must point at.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @var value-of<TrackingDomainRecordStatus> $status What the last DNS check saw. `not_checked` means DNS has not been consulted yet.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var array<string> $found What DNS returned when it did not match.
     */
    #[JsonProperty('found'), ArrayType(['string'])]
    public array $found;

    /**
     * @param array{
     *   type: value-of<TrackingDomainRecordType>,
     *   name: string,
     *   value: string,
     *   status: value-of<TrackingDomainRecordStatus>,
     *   found: array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->name = $values['name'];
        $this->value = $values['value'];
        $this->status = $values['status'];
        $this->found = $values['found'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
