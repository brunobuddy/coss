<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use DateTime;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Date;

class SubaccountStatsDay extends JsonSerializableType
{
    /**
     * @var DateTime $date The UTC date.
     */
    #[JsonProperty('date'), Date(Date::TYPE_DATE)]
    public DateTime $date;

    /**
     * @var int $recipients Recipients of the emails sent that day.
     */
    #[JsonProperty('recipients')]
    public int $recipients;

    /**
     * @var int $sent Handed to the provider (delivered or not).
     */
    #[JsonProperty('sent')]
    public int $sent;

    /**
     * @var int $delivered Deliveries that day.
     */
    #[JsonProperty('delivered')]
    public int $delivered;

    /**
     * @var int $bounced Bounces that day.
     */
    #[JsonProperty('bounced')]
    public int $bounced;

    /**
     * @var int $complained Complaints that day.
     */
    #[JsonProperty('complained')]
    public int $complained;

    /**
     * @var int $failed Failures that day.
     */
    #[JsonProperty('failed')]
    public int $failed;

    /**
     * @var int $suppressed Skipped: on a suppression list.
     */
    #[JsonProperty('suppressed')]
    public int $suppressed;

    /**
     * @param array{
     *   date: DateTime,
     *   recipients: int,
     *   sent: int,
     *   delivered: int,
     *   bounced: int,
     *   complained: int,
     *   failed: int,
     *   suppressed: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->date = $values['date'];
        $this->recipients = $values['recipients'];
        $this->sent = $values['sent'];
        $this->delivered = $values['delivered'];
        $this->bounced = $values['bounced'];
        $this->complained = $values['complained'];
        $this->failed = $values['failed'];
        $this->suppressed = $values['suppressed'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
