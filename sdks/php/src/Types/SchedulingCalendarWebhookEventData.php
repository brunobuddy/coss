<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The host and calendar connection this is about.
 */
class SchedulingCalendarWebhookEventData extends JsonSerializableType
{
    /**
     * @var string $hostId The host's id.
     */
    #[JsonProperty('host_id')]
    public string $hostId;

    /**
     * @var string $connectionId The calendar connection's id.
     */
    #[JsonProperty('connection_id')]
    public string $connectionId;

    /**
     * @var string $provider The calendar provider, such as `google`.
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var string $occurredAt When this happened.
     */
    #[JsonProperty('occurred_at')]
    public string $occurredAt;

    /**
     * @param array{
     *   hostId: string,
     *   connectionId: string,
     *   provider: string,
     *   occurredAt: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->hostId = $values['hostId'];
        $this->connectionId = $values['connectionId'];
        $this->provider = $values['provider'];
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
