<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class UpsertScheduleRequest extends JsonSerializableType
{
    /**
     * @var ?string $name A label for the schedule. Default on creation: `Default`.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $timeZone Default: the host's.
     */
    #[JsonProperty('time_zone')]
    public ?string $timeZone;

    /**
     * @var ?bool $isDefault `true` makes this the host's default schedule, in place of the current one. A host's first schedule is their default anyway.
     */
    #[JsonProperty('is_default')]
    public ?bool $isDefault;

    /**
     * @var array<SchedulingWeeklyRule> $rules Weekly hours in local time. A range can't cross midnight: use two.
     */
    #[JsonProperty('rules'), ArrayType([SchedulingWeeklyRule::class])]
    public array $rules;

    /**
     * @var ?array<SchedulingScheduleOverride> $overrides Replaces the schedule's overrides when given.
     */
    #[JsonProperty('overrides'), ArrayType([SchedulingScheduleOverride::class])]
    public ?array $overrides;

    /**
     * @param array{
     *   rules: array<SchedulingWeeklyRule>,
     *   name?: ?string,
     *   timeZone?: ?string,
     *   isDefault?: ?bool,
     *   overrides?: ?array<SchedulingScheduleOverride>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->timeZone = $values['timeZone'] ?? null;
        if (array_key_exists('timeZone', $values)) {
            $this->_setField('timeZone');
        }
        $this->isDefault = $values['isDefault'] ?? null;
        if (array_key_exists('isDefault', $values)) {
            $this->_setField('isDefault');
        }
        $this->rules = $values['rules'];
        $this->overrides = $values['overrides'] ?? null;
        if (array_key_exists('overrides', $values)) {
            $this->_setField('overrides');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
