<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingCalendarDelegationWebhookEventData extends JsonSerializableType
{
    /**
     * @var string $delegationId
     */
    #[JsonProperty('delegation_id')]
    public string $delegationId;

    /**
     * @var string $provider
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var string $domain
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var ?string $code What the provider said, when it refused.
     */
    #[JsonProperty('code')]
    public ?string $code;

    /**
     * @var string $occurredAt
     */
    #[JsonProperty('occurred_at')]
    public string $occurredAt;

    /**
     * @param array{
     *   delegationId: string,
     *   provider: string,
     *   domain: string,
     *   occurredAt: string,
     *   code?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->delegationId = $values['delegationId'];
        $this->provider = $values['provider'];
        $this->domain = $values['domain'];
        $this->code = $values['code'] ?? null;
        if (array_key_exists('code', $values)) {
            $this->_setField('code');
        }
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
