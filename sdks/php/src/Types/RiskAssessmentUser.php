<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who it's about.
 */
class RiskAssessmentUser extends JsonSerializableType
{
    /**
     * @var ?string $id Your user id. `null`: none given.
     */
    #[JsonProperty('id')]
    public ?string $id;

    /**
     * @var ?string $email `null` once removed (90 days after the assessment) or when none was given.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @param array{
     *   id?: ?string,
     *   email?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->id = $values['id'] ?? null;
        if (array_key_exists('id', $values)) {
            $this->_setField('id');
        }
        $this->email = $values['email'] ?? null;
        if (array_key_exists('email', $values)) {
            $this->_setField('email');
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
