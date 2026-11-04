<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Someone else coming along. They're emailed about the booking, with no manage link.
 */
class SchedulingGuestInput extends JsonSerializableType
{
    /**
     * @var string $email Where they're emailed about the booking.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?string $name Their name, if you have it.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @param array{
     *   email: string,
     *   name?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->email = $values['email'];
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
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
