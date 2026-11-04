<?php

namespace Coss\Scheduling\Sessions\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who's booking, if you already know: the browser then can't change it.
 */
class CreateSchedulingBookerSessionRequestAttendee extends JsonSerializableType
{
    /**
     * @var ?string $uid Your own id for this person, used to erase their data later.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?string $name Needed for coss.com to notify them. Can't contain a link.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $email Where coss.com emails them, if it does.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @var ?string $phone An E.164 number, for SMS reminders.
     */
    #[JsonProperty('phone')]
    public ?string $phone;

    /**
     * @var string $timeZone Their IANA time zone. A series keeps their local time across clock changes.
     */
    #[JsonProperty('time_zone')]
    public string $timeZone;

    /**
     * @var ?string $locale Their locale, such as `en-US`. Emails and texts about the booking are written in it when coss.com has it, otherwise in English, and guests get the same.
     */
    #[JsonProperty('locale')]
    public ?string $locale;

    /**
     * @param array{
     *   timeZone: string,
     *   uid?: ?string,
     *   name?: ?string,
     *   email?: ?string,
     *   phone?: ?string,
     *   locale?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->email = $values['email'] ?? null;
        if (array_key_exists('email', $values)) {
            $this->_setField('email');
        }
        $this->phone = $values['phone'] ?? null;
        if (array_key_exists('phone', $values)) {
            $this->_setField('phone');
        }
        $this->timeZone = $values['timeZone'];
        $this->locale = $values['locale'] ?? null;
        if (array_key_exists('locale', $values)) {
            $this->_setField('locale');
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
