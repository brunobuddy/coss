<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class VerificationSend extends JsonSerializableType
{
    /**
     * @var value-of<VerificationSendChannel> $channel `sms` or `email`.
     */
    #[JsonProperty('channel')]
    public string $channel;

    /**
     * @var value-of<VerificationSendRoute> $route `own_number`: one of your numbers; `shared_number`: coss.com's; `email`: your sender; `coss_email`: coss.com's sender.
     */
    #[JsonProperty('route')]
    public string $route;

    /**
     * @var ?string $smsId The SMS, in your environment: `own_number`, or any in a sandbox environment (`null` for coss.com's shared numbers' messages).
     */
    #[JsonProperty('sms_id')]
    public ?string $smsId;

    /**
     * @var ?string $emailId The email (`email` route only).
     */
    #[JsonProperty('email_id')]
    public ?string $emailId;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   channel: value-of<VerificationSendChannel>,
     *   route: value-of<VerificationSendRoute>,
     *   createdAt: DateTime,
     *   smsId?: ?string,
     *   emailId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->channel = $values['channel'];
        $this->route = $values['route'];
        $this->smsId = $values['smsId'] ?? null;
        if (array_key_exists('smsId', $values)) {
            $this->_setField('smsId');
        }
        $this->emailId = $values['emailId'] ?? null;
        if (array_key_exists('emailId', $values)) {
            $this->_setField('emailId');
        }
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
