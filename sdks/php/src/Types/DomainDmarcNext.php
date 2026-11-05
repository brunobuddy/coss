<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class DomainDmarcNext extends JsonSerializableType
{
    /**
     * @var value-of<DomainDmarcNextKind> $kind The kind of step this is.
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var value-of<DomainDmarcNextPolicy> $policy The policy that step gets to.
     */
    #[JsonProperty('policy')]
    public string $policy;

    /**
     * @var string $record The TXT record to publish at `_dmarc.<domain>`.
     */
    #[JsonProperty('record')]
    public string $record;

    /**
     * @param array{
     *   kind: value-of<DomainDmarcNextKind>,
     *   policy: value-of<DomainDmarcNextPolicy>,
     *   record: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->kind = $values['kind'];
        $this->policy = $values['policy'];
        $this->record = $values['record'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
