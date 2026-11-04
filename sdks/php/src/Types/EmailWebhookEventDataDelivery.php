<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class EmailWebhookEventDataDelivery extends JsonSerializableType
{
    /**
     * @var ?string $smtpResponse What the receiving server answered. `null`: not reported.
     */
    #[JsonProperty('smtp_response')]
    public ?string $smtpResponse;

    /**
     * @param array{
     *   smtpResponse?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->smtpResponse = $values['smtpResponse'] ?? null;
        if (array_key_exists('smtpResponse', $values)) {
            $this->_setField('smtpResponse');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
