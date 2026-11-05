<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingHostLocationPhone extends JsonSerializableType
{
    /**
     * @var string $number The number, in E.164 format.
     */
    #[JsonProperty('number')]
    public string $number;

    /**
     * @param array{
     *   number: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->number = $values['number'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
