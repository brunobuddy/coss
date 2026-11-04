<?php

namespace Coss\Scheduling\Availability\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class AvailabilitySearchRequest extends JsonSerializableType
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
     * @var string $end An ISO 8601 instant with an offset.
     */
    #[JsonProperty('end')]
    public string $end;

    /**
     * @var ?array<string, (
     *    string
     *   |array<string>
     * )> $attributes Only hosts matching all of these.
     */
    #[JsonProperty('attributes'), ArrayType(['string' => new Union('string', ['string'])])]
    public ?array $attributes;

    /**
     * @var ?array<string> $hosts Only these hosts (ids or uids). Default: everyone the event type could offer.
     */
    #[JsonProperty('hosts'), ArrayType(['string'])]
    public ?array $hosts;

    /**
     * @var ?int $slotsPerHost How many of each host's soonest slots to return.
     */
    #[JsonProperty('slots_per_host')]
    public ?int $slotsPerHost;

    /**
     * @var ?int $limit Hosts to return, soonest availability first.
     */
    #[JsonProperty('limit')]
    public ?int $limit;

    /**
     * @param array{
     *   eventType: string,
     *   start: string,
     *   end: string,
     *   attributes?: ?array<string, (
     *    string
     *   |array<string>
     * )>,
     *   hosts?: ?array<string>,
     *   slotsPerHost?: ?int,
     *   limit?: ?int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->eventType = $values['eventType'];
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->attributes = $values['attributes'] ?? null;
        if (array_key_exists('attributes', $values)) {
            $this->_setField('attributes');
        }
        $this->hosts = $values['hosts'] ?? null;
        if (array_key_exists('hosts', $values)) {
            $this->_setField('hosts');
        }
        $this->slotsPerHost = $values['slotsPerHost'] ?? null;
        if (array_key_exists('slotsPerHost', $values)) {
            $this->_setField('slotsPerHost');
        }
        $this->limit = $values['limit'] ?? null;
        if (array_key_exists('limit', $values)) {
            $this->_setField('limit');
        }
    }
}
