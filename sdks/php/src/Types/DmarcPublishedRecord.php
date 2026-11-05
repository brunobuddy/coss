<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * The DMARC record found at `_dmarc.<domain>` by the latest DNS check.
 */
class DmarcPublishedRecord extends JsonSerializableType
{
    /**
     * @var string $value The `v=DMARC1` TXT record as published.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @var ?value-of<DmarcPublishedRecordP> $p The domain's policy tag.
     */
    #[JsonProperty('p')]
    public ?string $p;

    /**
     * @var ?value-of<DmarcPublishedRecordSp> $sp The subdomain policy tag. `null`: not published.
     */
    #[JsonProperty('sp')]
    public ?string $sp;

    /**
     * @var ?value-of<DmarcPublishedRecordNp> $np The policy tag for non-existent subdomains. `null`: not published.
     */
    #[JsonProperty('np')]
    public ?string $np;

    /**
     * @var ?value-of<DmarcPublishedRecordAdkim> $adkim The DKIM alignment tag. `null`: not published.
     */
    #[JsonProperty('adkim')]
    public ?string $adkim;

    /**
     * @var ?value-of<DmarcPublishedRecordAspf> $aspf The SPF alignment tag. `null`: not published.
     */
    #[JsonProperty('aspf')]
    public ?string $aspf;

    /**
     * @var ?int $pct Removed by RFC 9989 but still honored by many receivers.
     */
    #[JsonProperty('pct')]
    public ?int $pct;

    /**
     * @var ?value-of<DmarcPublishedRecordT> $t The testing tag. `null`: not published.
     */
    #[JsonProperty('t')]
    public ?string $t;

    /**
     * @var array<string> $rua Aggregate report addresses.
     */
    #[JsonProperty('rua'), ArrayType(['string'])]
    public array $rua;

    /**
     * @param array{
     *   value: string,
     *   rua: array<string>,
     *   p?: ?value-of<DmarcPublishedRecordP>,
     *   sp?: ?value-of<DmarcPublishedRecordSp>,
     *   np?: ?value-of<DmarcPublishedRecordNp>,
     *   adkim?: ?value-of<DmarcPublishedRecordAdkim>,
     *   aspf?: ?value-of<DmarcPublishedRecordAspf>,
     *   pct?: ?int,
     *   t?: ?value-of<DmarcPublishedRecordT>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->value = $values['value'];
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
        $this->t = $values['t'] ?? null;
        if (array_key_exists('t', $values)) {
            $this->_setField('t');
        }
        $this->rua = $values['rua'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
