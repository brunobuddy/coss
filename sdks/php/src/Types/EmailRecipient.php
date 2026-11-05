<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * One recipient of an email and how delivery to them went.
 */
class EmailRecipient extends JsonSerializableType
{
    /**
     * @var string $address The bare, lower-cased address.
     */
    #[JsonProperty('address')]
    public string $address;

    /**
     * @var value-of<EmailRecipientType> $type Which list it's on: `to`, `cc` or `bcc`.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var value-of<EmailRecipientStatus> $status Delivery status of this recipient. `suppressed` means the address is on the environment's suppression list (for every email or for this email's category), so it was skipped. `canceled` means the scheduled email was canceled before it was sent.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?DateTime $lastEventAt When its latest delivery event happened. `null`: none yet.
     */
    #[JsonProperty('last_event_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastEventAt;

    /**
     * @param array{
     *   address: string,
     *   type: value-of<EmailRecipientType>,
     *   status: value-of<EmailRecipientStatus>,
     *   lastEventAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->address = $values['address'];
        $this->type = $values['type'];
        $this->status = $values['status'];
        $this->lastEventAt = $values['lastEventAt'] ?? null;
        if (array_key_exists('lastEventAt', $values)) {
            $this->_setField('lastEventAt');
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
