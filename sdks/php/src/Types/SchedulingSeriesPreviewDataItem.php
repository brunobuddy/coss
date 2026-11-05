<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSeriesPreviewDataItem extends JsonSerializableType
{
    /**
     * @var string $start When this occurrence starts.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var bool $available Whether it's free.
     */
    #[JsonProperty('available')]
    public bool $available;

    /**
     * @var ?string $reason Why it isn't free, such as `host_busy`, `already_claimed`, `outside_availability` or `no_hosts`. `null` when it is.
     */
    #[JsonProperty('reason')]
    public ?string $reason;

    /**
     * @var array<string> $hosts The ids of the hosts who could take it.
     */
    #[JsonProperty('hosts'), ArrayType(['string'])]
    public array $hosts;

    /**
     * @param array{
     *   start: string,
     *   available: bool,
     *   hosts: array<string>,
     *   reason?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->start = $values['start'];
        $this->available = $values['available'];
        $this->reason = $values['reason'] ?? null;
        if (array_key_exists('reason', $values)) {
            $this->_setField('reason');
        }
        $this->hosts = $values['hosts'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
