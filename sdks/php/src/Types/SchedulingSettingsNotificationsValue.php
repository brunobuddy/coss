<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingSettingsNotificationsValue extends JsonSerializableType
{
    /**
     * @var ?bool $emailAttendee Email the attendee about this event.
     */
    #[JsonProperty('email_attendee')]
    public ?bool $emailAttendee;

    /**
     * @var ?bool $emailHost Email the host about this event.
     */
    #[JsonProperty('email_host')]
    public ?bool $emailHost;

    /**
     * @var ?bool $smsAttendee Text the attendee about this event, if `sms_from` is set.
     */
    #[JsonProperty('sms_attendee')]
    public ?bool $smsAttendee;

    /**
     * @param array{
     *   emailAttendee?: ?bool,
     *   emailHost?: ?bool,
     *   smsAttendee?: ?bool,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->emailAttendee = $values['emailAttendee'] ?? null;
        if (array_key_exists('emailAttendee', $values)) {
            $this->_setField('emailAttendee');
        }
        $this->emailHost = $values['emailHost'] ?? null;
        if (array_key_exists('emailHost', $values)) {
            $this->_setField('emailHost');
        }
        $this->smsAttendee = $values['smsAttendee'] ?? null;
        if (array_key_exists('smsAttendee', $values)) {
            $this->_setField('smsAttendee');
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
