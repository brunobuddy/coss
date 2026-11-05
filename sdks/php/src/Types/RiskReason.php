<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RiskReason extends JsonSerializableType
{
    /**
     * @var value-of<RiskReasonCode> $code The reason's code, listed under Risk's reasons in the docs.
     */
    #[JsonProperty('code')]
    public string $code;

    /**
     * @var string $message What it means, in words. May change.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @var ?float $value The count behind a `velocity.*` reason, or the score behind a `content.*` one.
     */
    #[JsonProperty('value')]
    public ?float $value;

    /**
     * @var ?float $threshold What a `velocity.*` or `content.*` reason fires at.
     */
    #[JsonProperty('threshold')]
    public ?float $threshold;

    /**
     * @var ?value-of<RiskReasonWindow> $window `velocity.*`: the window it's counted over.
     */
    #[JsonProperty('window')]
    public ?string $window;

    /**
     * @var ?string $suggestion `email.typo`: the likely domain.
     */
    #[JsonProperty('suggestion')]
    public ?string $suggestion;

    /**
     * @var ?string $provider `ip.hosting_provider`, `ip.vpn_network`: the network's operator; `ip.vpn`: the VPN service.
     */
    #[JsonProperty('provider')]
    public ?string $provider;

    /**
     * @var ?string $previousUser `duplicate.canonical_mailbox`, `duplicate.device`: your id of the user who has the mailbox or device, if known.
     */
    #[JsonProperty('previous_user')]
    public ?string $previousUser;

    /**
     * @var ?string $previousAssessment `duplicate.canonical_mailbox`, `duplicate.device`: the assessment that first saw the mailbox or device.
     */
    #[JsonProperty('previous_assessment')]
    public ?string $previousAssessment;

    /**
     * @var ?string $entry `list.*`: the matching list entry.
     */
    #[JsonProperty('entry')]
    public ?string $entry;

    /**
     * @var ?string $rule `rule.matched`: the rule's id.
     */
    #[JsonProperty('rule')]
    public ?string $rule;

    /**
     * @var ?string $name `rule.matched`: the rule's name.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?value-of<RiskReasonType> $type `list.*`: what matched.
     */
    #[JsonProperty('type')]
    public ?string $type;

    /**
     * @param array{
     *   code: value-of<RiskReasonCode>,
     *   message: string,
     *   value?: ?float,
     *   threshold?: ?float,
     *   window?: ?value-of<RiskReasonWindow>,
     *   suggestion?: ?string,
     *   provider?: ?string,
     *   previousUser?: ?string,
     *   previousAssessment?: ?string,
     *   entry?: ?string,
     *   rule?: ?string,
     *   name?: ?string,
     *   type?: ?value-of<RiskReasonType>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->code = $values['code'];
        $this->message = $values['message'];
        $this->value = $values['value'] ?? null;
        if (array_key_exists('value', $values)) {
            $this->_setField('value');
        }
        $this->threshold = $values['threshold'] ?? null;
        if (array_key_exists('threshold', $values)) {
            $this->_setField('threshold');
        }
        $this->window = $values['window'] ?? null;
        if (array_key_exists('window', $values)) {
            $this->_setField('window');
        }
        $this->suggestion = $values['suggestion'] ?? null;
        if (array_key_exists('suggestion', $values)) {
            $this->_setField('suggestion');
        }
        $this->provider = $values['provider'] ?? null;
        if (array_key_exists('provider', $values)) {
            $this->_setField('provider');
        }
        $this->previousUser = $values['previousUser'] ?? null;
        if (array_key_exists('previousUser', $values)) {
            $this->_setField('previousUser');
        }
        $this->previousAssessment = $values['previousAssessment'] ?? null;
        if (array_key_exists('previousAssessment', $values)) {
            $this->_setField('previousAssessment');
        }
        $this->entry = $values['entry'] ?? null;
        if (array_key_exists('entry', $values)) {
            $this->_setField('entry');
        }
        $this->rule = $values['rule'] ?? null;
        if (array_key_exists('rule', $values)) {
            $this->_setField('rule');
        }
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->type = $values['type'] ?? null;
        if (array_key_exists('type', $values)) {
            $this->_setField('type');
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
