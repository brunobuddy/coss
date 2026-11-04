<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * The broadcast and how it fared.
 */
class BroadcastWebhookEventData extends JsonSerializableType
{
    /**
     * @var BroadcastWebhookEventDataBroadcast $broadcast
     */
    #[JsonProperty('broadcast')]
    public BroadcastWebhookEventDataBroadcast $broadcast;

    /**
     * @var ?string $pauseReason Why a paused broadcast waits. `null`: it isn't paused.
     */
    #[JsonProperty('pause_reason')]
    public ?string $pauseReason;

    /**
     * @var ?BroadcastWebhookEventDataError $error Why it failed. `null`: it didn't.
     */
    #[JsonProperty('error')]
    public ?BroadcastWebhookEventDataError $error;

    /**
     * @var BroadcastStats $stats
     */
    #[JsonProperty('stats')]
    public BroadcastStats $stats;

    /**
     * @var DateTime $occurredAt When this happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @param array{
     *   broadcast: BroadcastWebhookEventDataBroadcast,
     *   stats: BroadcastStats,
     *   occurredAt: DateTime,
     *   pauseReason?: ?string,
     *   error?: ?BroadcastWebhookEventDataError,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->broadcast = $values['broadcast'];
        $this->pauseReason = $values['pauseReason'] ?? null;
        if (array_key_exists('pauseReason', $values)) {
            $this->_setField('pauseReason');
        }
        $this->error = $values['error'] ?? null;
        if (array_key_exists('error', $values)) {
            $this->_setField('error');
        }
        $this->stats = $values['stats'];
        $this->occurredAt = $values['occurredAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
