<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingBookingWindowFrom extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingBookingWindowFromKind> $kind
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var string $from The first local date offered, `YYYY-MM-DD`.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var string $to The last local date offered, `YYYY-MM-DD`.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @param array{
     *   kind: value-of<SchedulingBookingWindowFromKind>,
     *   from: string,
     *   to: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->kind = $values['kind'];
        $this->from = $values['from'];
        $this->to = $values['to'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
