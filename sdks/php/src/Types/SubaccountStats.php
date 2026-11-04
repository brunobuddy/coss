<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class SubaccountStats extends JsonSerializableType
{
    /**
     * @var value-of<SubaccountStatsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $subaccountId The sub-account's id.
     */
    #[JsonProperty('subaccount_id')]
    public string $subaccountId;

    /**
     * @var DateTime $from The first date included.
     */
    #[JsonProperty('from'), Date(Date::TYPE_DATE)]
    public DateTime $from;

    /**
     * @var DateTime $to The last date included.
     */
    #[JsonProperty('to'), Date(Date::TYPE_DATE)]
    public DateTime $to;

    /**
     * @var array<SubaccountStatsDay> $data One entry per day with sends, oldest first; recipients count by their current status.
     */
    #[JsonProperty('data'), ArrayType([SubaccountStatsDay::class])]
    public array $data;

    /**
     * @param array{
     *   object: value-of<SubaccountStatsObject>,
     *   subaccountId: string,
     *   from: DateTime,
     *   to: DateTime,
     *   data: array<SubaccountStatsDay>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->subaccountId = $values['subaccountId'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->data = $values['data'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
