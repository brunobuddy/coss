<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingSchedule extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingScheduleObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $host The id of the host this schedule belongs to.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var string $name A label for the schedule. `Default` when none was given.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $timeZone The IANA time zone its rules and overrides are local to.
     */
    #[JsonProperty('time_zone')]
    public string $timeZone;

    /**
     * @var bool $isDefault Whether this is the host's default schedule, used by event types that don't name one. A host's first schedule always is.
     */
    #[JsonProperty('is_default')]
    public bool $isDefault;

    /**
     * @var array<SchedulingScheduleRulesItem> $rules Weekly hours in local time, unchanged across daylight saving.
     */
    #[JsonProperty('rules'), ArrayType([SchedulingScheduleRulesItem::class])]
    public array $rules;

    /**
     * @var array<SchedulingScheduleOverridesItem> $overrides Dates whose hours replace the weekly rules.
     */
    #[JsonProperty('overrides'), ArrayType([SchedulingScheduleOverridesItem::class])]
    public array $overrides;

    /**
     * @var string $createdAt
     */
    #[JsonProperty('created_at')]
    public string $createdAt;

    /**
     * @var string $updatedAt
     */
    #[JsonProperty('updated_at')]
    public string $updatedAt;

    /**
     * @param array{
     *   object: value-of<SchedulingScheduleObject>,
     *   id: string,
     *   host: string,
     *   name: string,
     *   timeZone: string,
     *   isDefault: bool,
     *   rules: array<SchedulingScheduleRulesItem>,
     *   overrides: array<SchedulingScheduleOverridesItem>,
     *   createdAt: string,
     *   updatedAt: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->host = $values['host'];
        $this->name = $values['name'];
        $this->timeZone = $values['timeZone'];
        $this->isDefault = $values['isDefault'];
        $this->rules = $values['rules'];
        $this->overrides = $values['overrides'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
