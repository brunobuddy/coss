<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * What receivers saw for DKIM and SPF.
 */
class DmarcReportRecordAuthResults extends JsonSerializableType
{
    /**
     * @var array<DmarcReportRecordAuthResultsDkimItem> $dkim Each DKIM signature's result.
     */
    #[JsonProperty('dkim'), ArrayType([DmarcReportRecordAuthResultsDkimItem::class])]
    public array $dkim;

    /**
     * @var array<DmarcReportRecordAuthResultsSpfItem> $spf Each SPF check's result.
     */
    #[JsonProperty('spf'), ArrayType([DmarcReportRecordAuthResultsSpfItem::class])]
    public array $spf;

    /**
     * @param array{
     *   dkim: array<DmarcReportRecordAuthResultsDkimItem>,
     *   spf: array<DmarcReportRecordAuthResultsSpfItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->dkim = $values['dkim'];
        $this->spf = $values['spf'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
