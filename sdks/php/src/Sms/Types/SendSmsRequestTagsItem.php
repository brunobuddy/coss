<?php

namespace Coss\Sms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SendSmsRequestTagsItem extends JsonSerializableType
{
    /**
     * @var string $name The tag's name, unique on the message.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $value The tag's value.
     */
    #[JsonProperty('value')]
    public string $value;

    /**
     * @param array{
     *   name: string,
     *   value: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->value = $values['value'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
