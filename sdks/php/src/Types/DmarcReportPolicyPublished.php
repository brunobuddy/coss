<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The policy the reporter found when it evaluated the mail.
 */
class DmarcReportPolicyPublished extends JsonSerializableType
{
    /**
     * @var string $domain The domain the policy was published for.
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var ?string $p The domain's policy tag.
     */
    #[JsonProperty('p')]
    public ?string $p;

    /**
     * @var ?string $sp The subdomain policy tag.
     */
    #[JsonProperty('sp')]
    public ?string $sp;

    /**
     * @var ?string $np The policy tag for non-existent subdomains.
     */
    #[JsonProperty('np')]
    public ?string $np;

    /**
     * @var ?string $adkim The DKIM alignment tag.
     */
    #[JsonProperty('adkim')]
    public ?string $adkim;

    /**
     * @var ?string $aspf The SPF alignment tag.
     */
    #[JsonProperty('aspf')]
    public ?string $aspf;

    /**
     * @var ?int $pct The percentage tag.
     */
    #[JsonProperty('pct')]
    public ?int $pct;

    /**
     * @var ?string $testing The testing tag.
     */
    #[JsonProperty('testing')]
    public ?string $testing;

    /**
     * @param array{
     *   domain: string,
     *   p?: ?string,
     *   sp?: ?string,
     *   np?: ?string,
     *   adkim?: ?string,
     *   aspf?: ?string,
     *   pct?: ?int,
     *   testing?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->domain = $values['domain'];
        $this->p = $values['p'] ?? null;
        if (array_key_exists('p', $values)) {
            $this->_setField('p');
        }
        $this->sp = $values['sp'] ?? null;
        if (array_key_exists('sp', $values)) {
            $this->_setField('sp');
        }
        $this->np = $values['np'] ?? null;
        if (array_key_exists('np', $values)) {
            $this->_setField('np');
        }
        $this->adkim = $values['adkim'] ?? null;
        if (array_key_exists('adkim', $values)) {
            $this->_setField('adkim');
        }
        $this->aspf = $values['aspf'] ?? null;
        if (array_key_exists('aspf', $values)) {
            $this->_setField('aspf');
        }
        $this->pct = $values['pct'] ?? null;
        if (array_key_exists('pct', $values)) {
            $this->_setField('pct');
        }
        $this->testing = $values['testing'] ?? null;
        if (array_key_exists('testing', $values)) {
            $this->_setField('testing');
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
