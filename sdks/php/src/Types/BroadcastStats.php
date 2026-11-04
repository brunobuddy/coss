<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * How its emails fared so far.
 */
class BroadcastStats extends JsonSerializableType
{
    /**
     * @var int $recipients Emails made so far (one per reached contact).
     */
    #[JsonProperty('recipients')]
    public int $recipients;

    /**
     * @var int $sent Emails accepted by the provider.
     */
    #[JsonProperty('sent')]
    public int $sent;

    /**
     * @var int $delivered Emails delivered to recipients' servers.
     */
    #[JsonProperty('delivered')]
    public int $delivered;

    /**
     * @var int $bounced Permanent bounces.
     */
    #[JsonProperty('bounced')]
    public int $bounced;

    /**
     * @var int $complained Emails marked as spam by recipients.
     */
    #[JsonProperty('complained')]
    public int $complained;

    /**
     * @var int $failed Emails that couldn't be sent.
     */
    #[JsonProperty('failed')]
    public int $failed;

    /**
     * @var int $opened Emails opened at least once (with open tracking).
     */
    #[JsonProperty('opened')]
    public int $opened;

    /**
     * @var int $clicked Emails clicked at least once (with click tracking).
     */
    #[JsonProperty('clicked')]
    public int $clicked;

    /**
     * @var int $unsubscribed Unsubscribes through the broadcast's links.
     */
    #[JsonProperty('unsubscribed')]
    public int $unsubscribed;

    /**
     * @param array{
     *   recipients: int,
     *   sent: int,
     *   delivered: int,
     *   bounced: int,
     *   complained: int,
     *   failed: int,
     *   opened: int,
     *   clicked: int,
     *   unsubscribed: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->recipients = $values['recipients'];
        $this->sent = $values['sent'];
        $this->delivered = $values['delivered'];
        $this->bounced = $values['bounced'];
        $this->complained = $values['complained'];
        $this->failed = $values['failed'];
        $this->opened = $values['opened'];
        $this->clicked = $values['clicked'];
        $this->unsubscribed = $values['unsubscribed'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
