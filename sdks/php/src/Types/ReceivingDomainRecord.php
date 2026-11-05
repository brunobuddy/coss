<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * The MX record to publish, with the result of the last check. Mail for the hostname is received as soon as it reaches coss.com; the check only shows what DNS serves.
 */
class ReceivingDomainRecord extends JsonSerializableType
{
    /**
     * @var value-of<ReceivingDomainRecordType> $type The record's type.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $name The fully qualified record name to create.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $value The mail exchange the record must point at.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @var int $priority The MX record's priority.
     */
    #[JsonProperty('priority')]
    public int $priority;

    /**
     * @var value-of<ReceivingDomainRecordStatus> $status What the last DNS check saw: `verified` once the most preferred MX records point at coss.com. `not_checked` means DNS has not been consulted yet.
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
     *   type: value-of<ReceivingDomainRecordType>,
     *   name: string,
     *   value: string,
     *   priority: int,
     *   status: value-of<ReceivingDomainRecordStatus>,
     *   found: array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->name = $values['name'];
        $this->value = $values['value'];
        $this->priority = $values['priority'];
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
