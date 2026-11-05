<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * What the receiving server concluded: `pass`, `fail`, `gray` (could not decide) or `processing_failed`; `null` when the check did not run.
 */
class ReceivedEmailVerdicts extends JsonSerializableType
{
    /**
     * @var ?value-of<ReceivedEmailVerdictsSpam> $spam The spam verdict.
     */
    #[JsonProperty('spam')]
    public ?string $spam;

    /**
     * @var ?value-of<ReceivedEmailVerdictsVirus> $virus The virus verdict.
     */
    #[JsonProperty('virus')]
    public ?string $virus;

    /**
     * @var ?value-of<ReceivedEmailVerdictsSpf> $spf The SPF verdict.
     */
    #[JsonProperty('spf')]
    public ?string $spf;

    /**
     * @var ?value-of<ReceivedEmailVerdictsDkim> $dkim The DKIM verdict.
     */
    #[JsonProperty('dkim')]
    public ?string $dkim;

    /**
     * @var ?value-of<ReceivedEmailVerdictsDmarc> $dmarc The DMARC verdict.
     */
    #[JsonProperty('dmarc')]
    public ?string $dmarc;

    /**
     * @var ?string $dmarcPolicy The sender domain's DMARC policy (`none`, `quarantine` or `reject`) when DMARC failed.
     */
    #[JsonProperty('dmarc_policy')]
    public ?string $dmarcPolicy;

    /**
     * @param array{
     *   spam?: ?value-of<ReceivedEmailVerdictsSpam>,
     *   virus?: ?value-of<ReceivedEmailVerdictsVirus>,
     *   spf?: ?value-of<ReceivedEmailVerdictsSpf>,
     *   dkim?: ?value-of<ReceivedEmailVerdictsDkim>,
     *   dmarc?: ?value-of<ReceivedEmailVerdictsDmarc>,
     *   dmarcPolicy?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->spam = $values['spam'] ?? null;
        if (array_key_exists('spam', $values)) {
            $this->_setField('spam');
        }
        $this->virus = $values['virus'] ?? null;
        if (array_key_exists('virus', $values)) {
            $this->_setField('virus');
        }
        $this->spf = $values['spf'] ?? null;
        if (array_key_exists('spf', $values)) {
            $this->_setField('spf');
        }
        $this->dkim = $values['dkim'] ?? null;
        if (array_key_exists('dkim', $values)) {
            $this->_setField('dkim');
        }
        $this->dmarc = $values['dmarc'] ?? null;
        if (array_key_exists('dmarc', $values)) {
            $this->_setField('dmarc');
        }
        $this->dmarcPolicy = $values['dmarcPolicy'] ?? null;
        if (array_key_exists('dmarcPolicy', $values)) {
            $this->_setField('dmarcPolicy');
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
