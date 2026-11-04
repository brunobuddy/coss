<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class RiskRule extends JsonSerializableType
{
    /**
     * @var value-of<RiskRuleObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name Your name for the rule, returned with reasons when it decides.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var bool $enabled `false`: it's kept, and no assessment applies it.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var int $position Rules are tried in ascending order.
     */
    #[JsonProperty('position')]
    public int $position;

    /**
     * @var array<value-of<RiskEvent>> $events Events it applies to; empty: every event.
     */
    #[JsonProperty('events'), ArrayType(['string'])]
    public array $events;

    /**
     * @var value-of<RiskRuleMatch> $match `all`: every condition must hold. `any`: one is enough.
     */
    #[JsonProperty('match')]
    public string $match;

    /**
     * @var array<RiskRuleCondition> $conditions What must hold, by `match`.
     */
    #[JsonProperty('conditions'), ArrayType([RiskRuleCondition::class])]
    public array $conditions;

    /**
     * @var value-of<RiskDecision> $action
     */
    #[JsonProperty('action')]
    public string $action;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<RiskRuleObject>,
     *   id: string,
     *   name: string,
     *   enabled: bool,
     *   position: int,
     *   events: array<value-of<RiskEvent>>,
     *   match: value-of<RiskRuleMatch>,
     *   conditions: array<RiskRuleCondition>,
     *   action: value-of<RiskDecision>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->enabled = $values['enabled'];
        $this->position = $values['position'];
        $this->events = $values['events'];
        $this->match = $values['match'];
        $this->conditions = $values['conditions'];
        $this->action = $values['action'];
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
