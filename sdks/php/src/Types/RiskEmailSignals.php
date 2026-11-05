<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * What the address says. `null` on an assessment with no email.
 */
class RiskEmailSignals extends JsonSerializableType
{
    /**
     * @var ?string $domain `null` once the address is removed (90 days after the assessment).
     */
    #[JsonProperty('domain')]
    public ?string $domain;

    /**
     * @var bool $valid Whether it's syntactically valid.
     */
    #[JsonProperty('valid')]
    public bool $valid;

    /**
     * @var bool $disposable Whether its domain is a known burner service.
     */
    #[JsonProperty('disposable')]
    public bool $disposable;

    /**
     * @var value-of<RiskEmailSignalsDeliverability> $deliverability From DNS (MX, A, AAAA). `unknown` when the lookup failed or timed out.
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
     * @var ?string $suggestion `email.typo`: the likely intended domain. `null` otherwise.
     */
    #[JsonProperty('suggestion')]
    public ?string $suggestion;

    /**
     * @var ?int $domainAgeDays Days since the domain was registered (RDAP); `null` when unknown or not looked up (free providers, disposable domains).
     */
    #[JsonProperty('domain_age_days')]
    public ?int $domainAgeDays;

    /**
     * @param array{
     *   valid: bool,
     *   disposable: bool,
     *   deliverability: value-of<RiskEmailSignalsDeliverability>,
     *   roleAccount: bool,
     *   freeProvider: bool,
     *   domain?: ?string,
     *   suggestion?: ?string,
     *   domainAgeDays?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->domain = $values['domain'] ?? null;
        if (array_key_exists('domain', $values)) {
            $this->_setField('domain');
        }
        $this->valid = $values['valid'];
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
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
