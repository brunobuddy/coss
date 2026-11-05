<?php

namespace Coss\Scheduling\Sessions\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Scheduling\Sessions\Types\CreateSchedulingBookerSessionRequestAttendee;

class CreateSchedulingBookerSessionRequest extends JsonSerializableType
{
    /**
     * @var string $eventType The event type's id or uid.
     */
    #[JsonProperty('event_type')]
    public string $eventType;

    /**
     * @var ?string $host Only this host (id or uid).
     */
    #[JsonProperty('host')]
    public ?string $host;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $attributes Only offer times, and book, among pool hosts matching all of these. The browser can't see or change them.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $attributes;

    /**
     * @var ?CreateSchedulingBookerSessionRequestAttendee $attendee Who's booking, if you already know: the browser then can't change it.
     */
    #[JsonProperty('attendee')]
    public ?CreateSchedulingBookerSessionRequestAttendee $attendee;

    /**
     * @var ?int $expiresIn Seconds until it stops working. At most a day.
     */
    #[JsonProperty('expires_in')]
    public ?int $expiresIn;

    /**
     * @param array{
     *   eventType: string,
     *   host?: ?string,
     *   attributes?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   attendee?: ?CreateSchedulingBookerSessionRequestAttendee,
     *   expiresIn?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->eventType = $values['eventType'];
        $this->host = $values['host'] ?? null;
        if (array_key_exists('host', $values)) {
            $this->_setField('host');
        }
        $this->attributes = $values['attributes'] ?? null;
        if (array_key_exists('attributes', $values)) {
            $this->_setField('attributes');
        }
        $this->attendee = $values['attendee'] ?? null;
        if (array_key_exists('attendee', $values)) {
            $this->_setField('attendee');
        }
        $this->expiresIn = $values['expiresIn'] ?? null;
        if (array_key_exists('expiresIn', $values)) {
            $this->_setField('expiresIn');
        }
    }
}
