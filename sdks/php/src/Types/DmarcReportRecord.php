<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class DmarcReportRecord extends JsonSerializableType
{
    /**
     * @var string $sourceIp The address the messages came from.
     */
    #[JsonProperty('source_ip')]
    public string $sourceIp;

    /**
     * @var int $count How many messages this line covers.
     */
    #[JsonProperty('count')]
    public int $count;

    /**
     * @var value-of<DmarcReportRecordDisposition> $disposition What the receiver did with the messages.
     */
    #[JsonProperty('disposition')]
    public string $disposition;

    /**
     * @var value-of<DmarcReportRecordDkim> $dkim Aligned DKIM result.
     */
    #[JsonProperty('dkim')]
    public string $dkim;

    /**
     * @var value-of<DmarcReportRecordSpf> $spf Aligned SPF result.
     */
    #[JsonProperty('spf')]
    public string $spf;

    /**
     * @var bool $dmarcPass Whether they passed DMARC.
     */
    #[JsonProperty('dmarc_pass')]
    public bool $dmarcPass;

    /**
     * @var string $headerFrom The domain in their `From` header.
     */
    #[JsonProperty('header_from')]
    public string $headerFrom;

    /**
     * @var ?string $envelopeFrom The domain in their envelope sender.
     */
    #[JsonProperty('envelope_from')]
    public ?string $envelopeFrom;

    /**
     * @var bool $viaCoss Whether they were sent through coss.com, by its DKIM selectors or bounce domain.
     */
    #[JsonProperty('via_coss')]
    public bool $viaCoss;

    /**
     * @var DmarcReportRecordAuthResults $authResults What receivers saw for DKIM and SPF.
     */
    #[JsonProperty('auth_results')]
    public DmarcReportRecordAuthResults $authResults;

    /**
     * @var array<DmarcReportRecordReasonsItem> $reasons Why receivers overrode the policy.
     */
    #[JsonProperty('reasons'), ArrayType([DmarcReportRecordReasonsItem::class])]
    public array $reasons;

    /**
     * @param array{
     *   sourceIp: string,
     *   count: int,
     *   disposition: value-of<DmarcReportRecordDisposition>,
     *   dkim: value-of<DmarcReportRecordDkim>,
     *   spf: value-of<DmarcReportRecordSpf>,
     *   dmarcPass: bool,
     *   headerFrom: string,
     *   viaCoss: bool,
     *   authResults: DmarcReportRecordAuthResults,
     *   reasons: array<DmarcReportRecordReasonsItem>,
     *   envelopeFrom?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->sourceIp = $values['sourceIp'];
        $this->count = $values['count'];
        $this->disposition = $values['disposition'];
        $this->dkim = $values['dkim'];
        $this->spf = $values['spf'];
        $this->dmarcPass = $values['dmarcPass'];
        $this->headerFrom = $values['headerFrom'];
        $this->envelopeFrom = $values['envelopeFrom'] ?? null;
        if (array_key_exists('envelopeFrom', $values)) {
            $this->_setField('envelopeFrom');
        }
        $this->viaCoss = $values['viaCoss'];
        $this->authResults = $values['authResults'];
        $this->reasons = $values['reasons'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
