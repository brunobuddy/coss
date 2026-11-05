<?php

namespace Coss\Email\Contacts\Properties\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Email\Contacts\Properties\Types\CreateContactPropertyRequestType;
use Coss\Core\Types\Union;

class CreateContactPropertyRequest extends JsonSerializableType
{
    /**
     * @var string $key How contacts and templates name it. Lower-case letters, digits and `_`, starting with a letter. Can't change.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<CreateContactPropertyRequestType> $type What values it takes. `date` values are ISO 8601 strings. Can't change.
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
     * @param array{
     *   key: string,
     *   type: value-of<CreateContactPropertyRequestType>,
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
        $this->key = $values['key'];
        $this->type = $values['type'];
        $this->fallback = $values['fallback'] ?? null;
        if (array_key_exists('fallback', $values)) {
            $this->_setField('fallback');
        }
    }
}
