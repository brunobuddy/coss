<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;
use DateTime;
use Coss\Core\Types\Date;

class ContactProperty extends JsonSerializableType
{
    /**
     * @var value-of<ContactPropertyObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $key How contacts and templates name it (`{{{contact.<key>}}}`). Can't change.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<ContactPropertyType> $type `date` values are ISO 8601 strings.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var (
     *    string
     *   |float
     *   |bool
     * )|null $fallback Used in templates for contacts without a value.
     */
    #[JsonProperty('fallback'), Union('string', 'float', 'bool', 'null')]
    public string|float|bool|null $fallback;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<ContactPropertyObject>,
     *   id: string,
     *   key: string,
     *   type: value-of<ContactPropertyType>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   fallback?: (
     *    string
     *   |float
     *   |bool
     * )|null,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->key = $values['key'];
        $this->type = $values['type'];
        $this->fallback = $values['fallback'] ?? null;
        if (array_key_exists('fallback', $values)) {
            $this->_setField('fallback');
        }
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
