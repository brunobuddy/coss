<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class RiskListEntry extends JsonSerializableType
{
    /**
     * @var value-of<RiskListEntryObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

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
     * @var string $value Normalized: emails as their mailbox, CIDR ranges canonical, ASNs as numbers.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @var ?string $note Your note about it. `null`: none.
     */
    #[JsonProperty('note')]
    public ?string $note;

    /**
     * @var ?DateTime $expiresAt When it stops matching. `null`: never.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<RiskListEntryObject>,
     *   id: string,
     *   list: value-of<RiskList>,
     *   type: value-of<RiskListEntryType>,
     *   value: string,
     *   createdAt: DateTime,
     *   note?: ?string,
     *   expiresAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
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
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
