<?php

namespace Coss\Scheduling\Hosts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Types\SchedulingHostLocation;
use Coss\Scheduling\Hosts\Types\UpdateHostRequestStatus;

class UpdateHostRequest extends JsonSerializableType
{
    /**
     * @var ?string $uid Your own id for this host, unique in the environment.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?string $name The host's name.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $email Where this host's notifications go. `null` removes it.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @var ?string $phone Where this host's SMS reminders go, in E.164. `null` removes it.
     */
    #[JsonProperty('phone')]
    public ?string $phone;

    /**
     * @var ?string $calendarAccount Moves the host's delegated calendar to this mailbox. Refused while they have upcoming bookings or holds.
     */
    #[JsonProperty('calendar_account')]
    public ?string $calendarAccount;

    /**
     * @var ?string $timeZone An IANA time zone name.
     */
    #[JsonProperty('time_zone')]
    public ?string $timeZone;

    /**
     * @var ?string $locale What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
     */
    #[JsonProperty('locale')]
    public ?string $locale;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $attributes What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $attributes;

    /**
     * @var ?array<SchedulingHostLocation> $locations Replaces this host's own locations. Existing bookings keep the location they have.
     */
    #[JsonProperty('locations'), ArrayType([SchedulingHostLocation::class])]
    public ?array $locations;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs. Don't put sensitive data here.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?value-of<UpdateHostRequestStatus> $status A `disabled` host isn't offered. Its existing bookings stay.
     */
    #[JsonProperty('status')]
    public ?string $status;

    /**
     * @param array{
     *   uid?: ?string,
     *   name?: ?string,
     *   email?: ?string,
     *   phone?: ?string,
     *   calendarAccount?: ?string,
     *   timeZone?: ?string,
     *   locale?: ?string,
     *   attributes?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   locations?: ?array<SchedulingHostLocation>,
     *   metadata?: ?array<string, string>,
     *   status?: ?value-of<UpdateHostRequestStatus>,
     * } $values
     */
    public function __construct(
        array $values = [],
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
        $this->calendarAccount = $values['calendarAccount'] ?? null;
        if (array_key_exists('calendarAccount', $values)) {
            $this->_setField('calendarAccount');
        }
        $this->timeZone = $values['timeZone'] ?? null;
        if (array_key_exists('timeZone', $values)) {
            $this->_setField('timeZone');
        }
        $this->locale = $values['locale'] ?? null;
        if (array_key_exists('locale', $values)) {
            $this->_setField('locale');
        }
        $this->attributes = $values['attributes'] ?? null;
        if (array_key_exists('attributes', $values)) {
            $this->_setField('attributes');
        }
        $this->locations = $values['locations'] ?? null;
        if (array_key_exists('locations', $values)) {
            $this->_setField('locations');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->status = $values['status'] ?? null;
        if (array_key_exists('status', $values)) {
            $this->_setField('status');
        }
    }
}
