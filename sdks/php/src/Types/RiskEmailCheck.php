<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class RiskEmailCheck extends JsonSerializableType
{
    /**
     * @var value-of<RiskEmailCheckObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $email The address checked.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var bool $valid Syntactically valid (the rest assumes it is).
     */
    #[JsonProperty('valid')]
    public bool $valid;

    /**
     * @var ?string $domain Its domain. `null` when it isn't valid.
     */
    #[JsonProperty('domain')]
    public ?string $domain;

    /**
     * @var ?string $canonical The mailbox with the provider's aliasing folded (dots and `+tags` at Gmail…): two addresses with the same canonical form reach one inbox.
     */
    #[JsonProperty('canonical')]
    public ?string $canonical;

    /**
     * @var bool $disposable Whether its domain is a known burner service.
     */
    #[JsonProperty('disposable')]
    public bool $disposable;

    /**
     * @var value-of<RiskEmailCheckDeliverability> $deliverability From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.
     */
    #[JsonProperty('deliverability')]
    public string $deliverability;

    /**
     * @var bool $roleAccount Whether it's a role mailbox, like `info@`.
     */
    #[JsonProperty('role_account')]
    public bool $roleAccount;

    /**
     * @var bool $freeProvider Whether its domain is a free mailbox provider.
     */
    #[JsonProperty('free_provider')]
    public bool $freeProvider;

    /**
     * @var ?string $suggestion The likely intended domain when this one looks like a typo of a popular one.
     */
    #[JsonProperty('suggestion')]
    public ?string $suggestion;

    /**
     * @var ?int $domainAgeDays Days since the domain was registered (RDAP); `null` when unknown or not looked up (free providers, disposable domains).
     */
    #[JsonProperty('domain_age_days')]
    public ?int $domainAgeDays;

    /**
     * @var array<value-of<RiskEmailCheckDegradedItem>> $degraded Lookups that failed or timed out (their fields are `unknown`/`null`).
     */
    #[JsonProperty('degraded'), ArrayType(['string'])]
    public array $degraded;

    /**
     * @param array{
     *   object: value-of<RiskEmailCheckObject>,
     *   email: string,
     *   valid: bool,
     *   disposable: bool,
     *   deliverability: value-of<RiskEmailCheckDeliverability>,
     *   roleAccount: bool,
     *   freeProvider: bool,
     *   degraded: array<value-of<RiskEmailCheckDegradedItem>>,
     *   domain?: ?string,
     *   canonical?: ?string,
     *   suggestion?: ?string,
     *   domainAgeDays?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->email = $values['email'];
        $this->valid = $values['valid'];
        $this->domain = $values['domain'] ?? null;
        if (array_key_exists('domain', $values)) {
            $this->_setField('domain');
        }
        $this->canonical = $values['canonical'] ?? null;
        if (array_key_exists('canonical', $values)) {
            $this->_setField('canonical');
        }
        $this->disposable = $values['disposable'];
        $this->deliverability = $values['deliverability'];
        $this->roleAccount = $values['roleAccount'];
        $this->freeProvider = $values['freeProvider'];
        $this->suggestion = $values['suggestion'] ?? null;
        if (array_key_exists('suggestion', $values)) {
            $this->_setField('suggestion');
        }
        $this->domainAgeDays = $values['domainAgeDays'] ?? null;
        if (array_key_exists('domainAgeDays', $values)) {
            $this->_setField('domainAgeDays');
        }
        $this->degraded = $values['degraded'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
