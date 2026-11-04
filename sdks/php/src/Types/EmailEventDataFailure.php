<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class EmailEventDataFailure extends JsonSerializableType
{
    /**
     * @var string $code Machine-readable reason.
     */
    #[JsonProperty('code')]
    public string $code;

    /**
     * @var string $message Human-readable explanation.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @param array{
     *   code: string,
     *   message: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->code = $values['code'];
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
