<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class ContactImport extends JsonSerializableType
{
    /**
     * @var value-of<ContactImportObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var int $created Contacts created.
     */
    #[JsonProperty('created')]
    public int $created;

    /**
     * @var int $updated Existing contacts updated.
     */
    #[JsonProperty('updated')]
    public int $updated;

    /**
     * @var int $keptUnsubscribed Existing contacts the import marked `subscribed` that stay `unsubscribed`: an import never re-subscribes anyone.
     */
    #[JsonProperty('kept_unsubscribed')]
    public int $keptUnsubscribed;

    /**
     * @var array<ContactImportInvalidItem> $invalid Entries that were refused. The rest of the import still went through.
     */
    #[JsonProperty('invalid'), ArrayType([ContactImportInvalidItem::class])]
    public array $invalid;

    /**
     * @param array{
     *   object: value-of<ContactImportObject>,
     *   created: int,
     *   updated: int,
     *   keptUnsubscribed: int,
     *   invalid: array<ContactImportInvalidItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->created = $values['created'];
        $this->updated = $values['updated'];
        $this->keptUnsubscribed = $values['keptUnsubscribed'];
        $this->invalid = $values['invalid'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
