<?php

namespace Coss\Email\Contacts\Properties\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;

class UpdateContactPropertyRequest extends JsonSerializableType
{
    /**
     * @var (
     *    string
     *   |float
     *   |bool
     * )|null $fallback Used in templates for contacts without a value. `null` removes it.
     */
    #[JsonProperty('fallback'), Union('string', 'float', 'bool', 'null')]
    public string|float|bool|null $fallback;

    /**
     * @param array{
     *   fallback?: (
     *    string
     *   |float
     *   |bool
     * )|null,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->fallback = $values['fallback'] ?? null;
        if (array_key_exists('fallback', $values)) {
            $this->_setField('fallback');
        }
    }
}
