<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingCalendarConnection extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingCalendarConnectionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $host The id of the host it belongs to.
     */
    #[JsonProperty('host')]
    public string $host;

    /**
     * @var value-of<SchedulingCalendarConnectionProvider> $provider Where the calendar lives. `simulated` exists only in sandbox environments; `zoom` is only used for meetings, never read for busy times.
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var string $account The provider's account, such as the Google address.
     */
    #[JsonProperty('account')]
    public string $account;

    /**
     * @var value-of<SchedulingCalendarConnectionStatus> $status `needs_reauth`: access was lost, and this host isn't offered until it's back.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $delegation The calendar delegation that manages this connection. It can't be disconnected or reconnected by itself.
     */
    #[JsonProperty('delegation')]
    public ?string $delegation;

    /**
     * @var array<SchedulingCalendarConnectionCalendarsItem> $calendars The account's calendars.
     */
    #[JsonProperty('calendars'), ArrayType([SchedulingCalendarConnectionCalendarsItem::class])]
    public array $calendars;

    /**
     * @var string $createdAt
     */
    #[JsonProperty('created_at')]
    public string $createdAt;

    /**
     * @param array{
     *   object: value-of<SchedulingCalendarConnectionObject>,
     *   id: string,
     *   host: string,
     *   provider: value-of<SchedulingCalendarConnectionProvider>,
     *   account: string,
     *   status: value-of<SchedulingCalendarConnectionStatus>,
     *   calendars: array<SchedulingCalendarConnectionCalendarsItem>,
     *   createdAt: string,
     *   delegation?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->host = $values['host'];
        $this->provider = $values['provider'];
        $this->account = $values['account'];
        $this->status = $values['status'];
        $this->delegation = $values['delegation'] ?? null;
        if (array_key_exists('delegation', $values)) {
            $this->_setField('delegation');
        }
        $this->calendars = $values['calendars'];
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
