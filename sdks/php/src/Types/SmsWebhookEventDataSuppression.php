<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * `sms.suppressed`: the entry that made coss.com skip the number.
 */
class SmsWebhookEventDataSuppression extends JsonSerializableType
{
    /**
     * @var string $id The suppression's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SmsWebhookEventDataSuppressionReason> $reason Why the number is suppressed.
     */
    #[JsonProperty('reason')]
    public string $reason;

    /**
     * @param array{
     *   id: string,
     *   reason: value-of<SmsWebhookEventDataSuppressionReason>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->reason = $values['reason'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
