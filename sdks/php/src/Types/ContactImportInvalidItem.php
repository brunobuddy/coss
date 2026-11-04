<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class ContactImportInvalidItem extends JsonSerializableType
{
    /**
     * @var int $index The entry's position in `contacts`, from 0.
     */
    #[JsonProperty('index')]
    public int $index;

    /**
     * @var string $email The address it gave.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var string $message Why it was refused.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @param array{
     *   index: int,
     *   email: string,
     *   message: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->index = $values['index'];
        $this->email = $values['email'];
        $this->message = $values['message'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
