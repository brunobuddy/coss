<?php

namespace Coss\Risk\Rules\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\RiskEvent;
use Coss\Core\Types\ArrayType;
use Coss\Risk\Rules\Types\CreateRiskRuleRequestMatch;
use Coss\Types\RiskRuleCondition;
use Coss\Types\RiskDecision;

class CreateRiskRuleRequest extends JsonSerializableType
{
    /**
     * @var string $name Your name for the rule, returned with reasons when it decides.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?bool $enabled Default `true`.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @var ?int $position Default 0.
     */
    #[JsonProperty('position')]
    public ?int $position;

    /**
     * @var ?array<value-of<RiskEvent>> $events Events it applies to. Default: every event.
     */
    #[JsonProperty('events'), ArrayType(['string'])]
    public ?array $events;

    /**
     * @var ?value-of<CreateRiskRuleRequestMatch> $match Default `all`.
     */
    #[JsonProperty('match')]
    public ?string $match;

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
     * @param array{
     *   name: string,
     *   conditions: array<RiskRuleCondition>,
     *   action: value-of<RiskDecision>,
     *   enabled?: ?bool,
     *   position?: ?int,
     *   events?: ?array<value-of<RiskEvent>>,
     *   match?: ?value-of<CreateRiskRuleRequestMatch>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
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
        $this->conditions = $values['conditions'];
        $this->action = $values['action'];
    }
}
