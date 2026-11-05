<?php

namespace Coss\Risk\Rules\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\RiskEvent;
use Coss\Core\Types\ArrayType;
use Coss\Risk\Rules\Types\UpdateRiskRuleRequestMatch;
use Coss\Types\RiskRuleCondition;
use Coss\Types\RiskDecision;

class UpdateRiskRuleRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Your name for the rule.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?bool $enabled `false` keeps it, and stops applying it.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @var ?int $position Rules are tried in ascending order.
     */
    #[JsonProperty('position')]
    public ?int $position;

    /**
     * @var ?array<value-of<RiskEvent>> $events Events it applies to. Empty: every event.
     */
    #[JsonProperty('events'), ArrayType(['string'])]
    public ?array $events;

    /**
     * @var ?value-of<UpdateRiskRuleRequestMatch> $match `all`: every condition must hold. `any`: one is enough.
     */
    #[JsonProperty('match')]
    public ?string $match;

    /**
     * @var ?array<RiskRuleCondition> $conditions What must hold, by `match`.
     */
    #[JsonProperty('conditions'), ArrayType([RiskRuleCondition::class])]
    public ?array $conditions;

    /**
     * @var ?value-of<RiskDecision> $action
     */
    #[JsonProperty('action')]
    public ?string $action;

    /**
     * @param array{
     *   name?: ?string,
     *   enabled?: ?bool,
     *   position?: ?int,
     *   events?: ?array<value-of<RiskEvent>>,
     *   match?: ?value-of<UpdateRiskRuleRequestMatch>,
     *   conditions?: ?array<RiskRuleCondition>,
     *   action?: ?value-of<RiskDecision>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
        }
        $this->position = $values['position'] ?? null;
        if (array_key_exists('position', $values)) {
            $this->_setField('position');
        }
        $this->events = $values['events'] ?? null;
        if (array_key_exists('events', $values)) {
            $this->_setField('events');
        }
        $this->match = $values['match'] ?? null;
        if (array_key_exists('match', $values)) {
            $this->_setField('match');
        }
        $this->conditions = $values['conditions'] ?? null;
        if (array_key_exists('conditions', $values)) {
            $this->_setField('conditions');
        }
        $this->action = $values['action'] ?? null;
        if (array_key_exists('action', $values)) {
            $this->_setField('action');
        }
    }
}
