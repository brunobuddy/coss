<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class SchedulingHost extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingHostObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?string $uid Your own id for this host, unique in the environment, accepted wherever a host id is. `null` when none is set.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var string $name The host's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $email Where this host's notifications go. `null` when none is set. Not an identity, and need not be unique.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @var ?string $phone Where this host's SMS reminders go, in E.164. `null` when none is set.
     */
    #[JsonProperty('phone')]
    public ?string $phone;

    /**
     * @var ?string $calendarAccount The mailbox a calendar delegation connects for this host, when it isn't `email`. `null` when none is set.
     */
    #[JsonProperty('calendar_account')]
    public ?string $calendarAccount;

    /**
     * @var string $timeZone The host's IANA time zone. Their schedules default to it, and limits count days and weeks in it.
     */
    #[JsonProperty('time_zone')]
    public string $timeZone;

    /**
     * @var ?string $locale What this host's notifications are written in. `null`: English.
     */
    #[JsonProperty('locale')]
    public ?string $locale;

    /**
     * @var array<string, (
     *    string
     *   |array<string>
     * )> $attributes What pools filter hosts by, as strings or lists of strings.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => new Union('string', ['string'])])]
    public array $attributes;

    /**
     * @var array<SchedulingHostLocation> $locations This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
     */
    #[JsonProperty('locations'), ArrayType([SchedulingHostLocation::class])]
    public array $locations;

    /**
     * @var array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public array $metadata;

    /**
     * @var value-of<SchedulingHostStatus> $status `active`: can be offered. `disabled`: isn't offered, and keeps its existing bookings.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var string $createdAt
     */
    #[JsonProperty('created_at')]
    public string $createdAt;

    /**
     * @var string $updatedAt
     */
    #[JsonProperty('updated_at')]
    public string $updatedAt;

    /**
     * @param array{
     *   object: value-of<SchedulingHostObject>,
     *   id: string,
     *   name: string,
     *   timeZone: string,
     *   attributes: array<string, (
     *    string
     *   |array<string>
     * )>,
     *   locations: array<SchedulingHostLocation>,
     *   metadata: array<string, string>,
     *   status: value-of<SchedulingHostStatus>,
     *   createdAt: string,
     *   updatedAt: string,
     *   uid?: ?string,
     *   email?: ?string,
     *   phone?: ?string,
     *   calendarAccount?: ?string,
     *   locale?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->name = $values['name'];
        $this->email = $values['email'] ?? null;
        if (array_key_exists('email', $values)) {
            $this->_setField('email');
        }
        $this->phone = $values['phone'] ?? null;
        if (array_key_exists('phone', $values)) {
            $this->_setField('phone');
        }
        $this->calendarAccount = $values['calendarAccount'] ?? null;
        if (array_key_exists('calendarAccount', $values)) {
            $this->_setField('calendarAccount');
        }
        $this->timeZone = $values['timeZone'];
        $this->locale = $values['locale'] ?? null;
        if (array_key_exists('locale', $values)) {
            $this->_setField('locale');
        }
        $this->attributes = $values['attributes'];
        $this->locations = $values['locations'];
        $this->metadata = $values['metadata'];
        $this->status = $values['status'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
