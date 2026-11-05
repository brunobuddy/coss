<?php

namespace Coss\Scheduling\Hosts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Types\SchedulingHostLocation;

class CreateHostRequest extends JsonSerializableType
{
    /**
     * @var ?string $uid Your own id for this host, unique in the environment.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var string $name The host's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $email Where this host's notifications go. Not an identity, and need not be unique.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @var ?string $phone Where this host's SMS reminders go, in E.164.
     */
    #[JsonProperty('phone')]
    public ?string $phone;

    /**
     * @var ?string $calendarAccount The mailbox a calendar delegation connects for this host, when it isn't `email` or the delegation doesn't match on email. In Microsoft 365, their user principal name.
     */
    #[JsonProperty('calendar_account')]
    public ?string $calendarAccount;

    /**
     * @var string $timeZone An IANA time zone name.
     */
    #[JsonProperty('time_zone')]
    public string $timeZone;

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
     * @var ?array<SchedulingHostLocation> $locations This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
     */
    #[JsonProperty('locations'), ArrayType([SchedulingHostLocation::class])]
    public ?array $locations;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs. Don't put sensitive data here.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @param array{
     *   name: string,
     *   timeZone: string,
     *   uid?: ?string,
     *   email?: ?string,
     *   phone?: ?string,
     *   calendarAccount?: ?string,
     *   locale?: ?string,
     *   attributes?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   locations?: ?array<SchedulingHostLocation>,
     *   metadata?: ?array<string, string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
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
    }
}
