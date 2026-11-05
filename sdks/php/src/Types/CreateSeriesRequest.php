<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class CreateSeriesRequest extends JsonSerializableType
{
    /**
     * @var string $eventType The event type's id or uid.
     */
    #[JsonProperty('event_type')]
    public string $eventType;

    /**
     * @var string $start An ISO 8601 instant with an offset.
     */
    #[JsonProperty('start')]
    public string $start;

    /**
     * @var ?string $host A specific host (id or uid). Default: chosen fairly from those free.
     */
    #[JsonProperty('host')]
    public ?string $host;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $attributes Only choose among pool hosts matching all of these.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $attributes;

    /**
     * @var ?int $durationMinutes One of the event type's `duration_options`.
     */
    #[JsonProperty('duration_minutes')]
    public ?int $durationMinutes;

    /**
     * @var SchedulingAttendeeInput $attendee
     */
    #[JsonProperty('attendee')]
    public SchedulingAttendeeInput $attendee;

    /**
     * @var ?array<SchedulingGuestInput> $guests Up to the event type's `max_guests`.
     */
    #[JsonProperty('guests'), ArrayType([SchedulingGuestInput::class])]
    public ?array $guests;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $answers Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
     */
    #[JsonProperty('answers'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $answers;

    /**
     * @var ?CreateSeriesRequestLocation $location One of the event type's `locations`, with your link filled in if it has none.
     */
    #[JsonProperty('location')]
    public ?CreateSeriesRequestLocation $location;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs. Don't put sensitive data here.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var CreateSeriesRequestRecurrence $recurrence How often the booking repeats, at the attendee's local time.
     */
    #[JsonProperty('recurrence')]
    public CreateSeriesRequestRecurrence $recurrence;

    /**
     * @var ?value-of<CreateSeriesRequestOnConflict> $onConflict If an occurrence isn't free: book nothing, or book the rest and report it.
     */
    #[JsonProperty('on_conflict')]
    public ?string $onConflict;

    /**
     * @param array{
     *   eventType: string,
     *   start: string,
     *   attendee: SchedulingAttendeeInput,
     *   recurrence: CreateSeriesRequestRecurrence,
     *   host?: ?string,
     *   attributes?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   durationMinutes?: ?int,
     *   guests?: ?array<SchedulingGuestInput>,
     *   answers?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   location?: ?CreateSeriesRequestLocation,
     *   metadata?: ?array<string, string>,
     *   onConflict?: ?value-of<CreateSeriesRequestOnConflict>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->eventType = $values['eventType'];
        $this->start = $values['start'];
        $this->host = $values['host'] ?? null;
        if (array_key_exists('host', $values)) {
            $this->_setField('host');
        }
        $this->attributes = $values['attributes'] ?? null;
        if (array_key_exists('attributes', $values)) {
            $this->_setField('attributes');
        }
        $this->durationMinutes = $values['durationMinutes'] ?? null;
        if (array_key_exists('durationMinutes', $values)) {
            $this->_setField('durationMinutes');
        }
        $this->attendee = $values['attendee'];
        $this->guests = $values['guests'] ?? null;
        if (array_key_exists('guests', $values)) {
            $this->_setField('guests');
        }
        $this->answers = $values['answers'] ?? null;
        if (array_key_exists('answers', $values)) {
            $this->_setField('answers');
        }
        $this->location = $values['location'] ?? null;
        if (array_key_exists('location', $values)) {
            $this->_setField('location');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->recurrence = $values['recurrence'];
        $this->onConflict = $values['onConflict'] ?? null;
        if (array_key_exists('onConflict', $values)) {
            $this->_setField('onConflict');
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
