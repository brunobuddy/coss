<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class SchedulingBookingAttendeesItem extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SchedulingBookingAttendeesItemRole> $role `attendee` booked it and comes first; a `guest` was added by them.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var ?string $uid Your own id for this person. `null` when none was given.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?string $name `null` when not given, or after their details are erased.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $email `null` when not given, or after their details are erased.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @var ?string $phone `null` when not given, or after their details are erased.
     */
    #[JsonProperty('phone')]
    public ?string $phone;

    /**
     * @var string $timeZone Their IANA time zone.
     */
    #[JsonProperty('time_zone')]
    public string $timeZone;

    /**
     * @var ?string $locale Their locale. `null` when not given.
     */
    #[JsonProperty('locale')]
    public ?string $locale;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $answers Only when retrieving one booking.
     */
    #[JsonProperty('answers'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $answers;

    /**
     * @param array{
     *   id: string,
     *   role: value-of<SchedulingBookingAttendeesItemRole>,
     *   timeZone: string,
     *   uid?: ?string,
     *   name?: ?string,
     *   email?: ?string,
     *   phone?: ?string,
     *   locale?: ?string,
     *   answers?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->role = $values['role'];
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
        $this->answers = $values['answers'] ?? null;
        if (array_key_exists('answers', $values)) {
            $this->_setField('answers');
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
