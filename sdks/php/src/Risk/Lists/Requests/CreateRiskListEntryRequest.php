<?php

namespace Coss\Risk\Lists\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\RiskList;
use Coss\Core\Json\JsonProperty;
use Coss\Types\RiskListEntryType;
use DateTime;
use Coss\Core\Types\Date;

class CreateRiskListEntryRequest extends JsonSerializableType
{
    /**
     * @var value-of<RiskList> $list
     */
    #[JsonProperty('list')]
    public string $list;

    /**
     * @var value-of<RiskListEntryType> $type
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var string $value What to match: the address, domain, IP, CIDR range, ASN or other value of its `type`.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @var ?string $note Your note about it.
     */
    #[JsonProperty('note')]
    public ?string $note;

    /**
     * @var ?DateTime $expiresAt The entry stops matching at this time (it is kept until deleted).
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @param array{
     *   list: value-of<RiskList>,
     *   type: value-of<RiskListEntryType>,
     *   value: string,
     *   note?: ?string,
     *   expiresAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->list = $values['list'];
        $this->type = $values['type'];
        $this->value = $values['value'];
        $this->note = $values['note'] ?? null;
        if (array_key_exists('note', $values)) {
            $this->_setField('note');
        }
        $this->expiresAt = $values['expiresAt'] ?? null;
        if (array_key_exists('expiresAt', $values)) {
            $this->_setField('expiresAt');
        }
    }
}
