<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class EmailWebhookEventDataDelay extends JsonSerializableType
{
    /**
     * @var string $type The provider's reason for the delay.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?DateTime $expiresAt When the provider stops trying. `null`: not reported.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @var ?string $diagnosticCode What the receiving server answered. `null`: not reported.
     */
    #[JsonProperty('diagnostic_code')]
    public ?string $diagnosticCode;

    /**
     * @param array{
     *   type: string,
     *   expiresAt?: ?DateTime,
     *   diagnosticCode?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->expiresAt = $values['expiresAt'] ?? null;
        if (array_key_exists('expiresAt', $values)) {
            $this->_setField('expiresAt');
        }
        $this->diagnosticCode = $values['diagnosticCode'] ?? null;
        if (array_key_exists('diagnosticCode', $values)) {
            $this->_setField('diagnosticCode');
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
