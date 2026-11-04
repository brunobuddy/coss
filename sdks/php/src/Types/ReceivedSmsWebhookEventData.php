<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class ReceivedSmsWebhookEventData extends JsonSerializableType
{
    /**
     * @var ?string $receivedSmsId The received message; `null` for an opt-out to a number whose replies go to no environment.
     */
    #[JsonProperty('received_sms_id')]
    public ?string $receivedSmsId;

    /**
     * @var string $from Who sent it.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var string $to Your number that received it.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @var ?value-of<ReceivedSmsWebhookEventDataKeyword> $keyword The keyword it is, if any: `stop`, `start` or `help`. `null`: none.
     */
    #[JsonProperty('keyword')]
    public ?string $keyword;

    /**
     * @var bool $sandbox Whether it's a simulated message of a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @param array{
     *   from: string,
     *   to: string,
     *   sandbox: bool,
     *   occurredAt: DateTime,
     *   receivedSmsId?: ?string,
     *   keyword?: ?value-of<ReceivedSmsWebhookEventDataKeyword>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->receivedSmsId = $values['receivedSmsId'] ?? null;
        if (array_key_exists('receivedSmsId', $values)) {
            $this->_setField('receivedSmsId');
        }
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->keyword = $values['keyword'] ?? null;
        if (array_key_exists('keyword', $values)) {
            $this->_setField('keyword');
        }
        $this->sandbox = $values['sandbox'];
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
