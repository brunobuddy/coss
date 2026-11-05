<?php

namespace Coss\Scheduling\Bookings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Scheduling\Bookings\Types\ListBookingsRequestStatus;

class ListBookingsRequest extends JsonSerializableType
{
    /**
     * @var ?int $limit
     */
    public ?int $limit;

    /**
     * @var ?string $after The last id of the previous page.
     */
    public ?string $after;

    /**
     * @var ?string $host
     */
    public ?string $host;

    /**
     * @var ?string $eventType
     */
    public ?string $eventType;

    /**
     * @var ?value-of<ListBookingsRequestStatus> $status
     */
    public ?string $status;

    /**
     * @var ?string $attendeeUid
     */
    public ?string $attendeeUid;

    /**
     * @var ?string $startAfter An ISO 8601 instant with an offset.
     */
    public ?string $startAfter;

    /**
     * @var ?string $startBefore An ISO 8601 instant with an offset.
     */
    public ?string $startBefore;

    /**
     * @param array{
     *   limit?: ?int,
     *   after?: ?string,
     *   host?: ?string,
     *   eventType?: ?string,
     *   status?: ?value-of<ListBookingsRequestStatus>,
     *   attendeeUid?: ?string,
     *   startAfter?: ?string,
     *   startBefore?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->limit = $values['limit'] ?? null;
        if (array_key_exists('limit', $values)) {
            $this->_setField('limit');
        }
        $this->after = $values['after'] ?? null;
        if (array_key_exists('after', $values)) {
            $this->_setField('after');
        }
        $this->host = $values['host'] ?? null;
        if (array_key_exists('host', $values)) {
            $this->_setField('host');
        }
        $this->eventType = $values['eventType'] ?? null;
        if (array_key_exists('eventType', $values)) {
            $this->_setField('eventType');
        }
        $this->status = $values['status'] ?? null;
        if (array_key_exists('status', $values)) {
            $this->_setField('status');
        }
        $this->attendeeUid = $values['attendeeUid'] ?? null;
        if (array_key_exists('attendeeUid', $values)) {
            $this->_setField('attendeeUid');
        }
        $this->startAfter = $values['startAfter'] ?? null;
        if (array_key_exists('startAfter', $values)) {
            $this->_setField('startAfter');
        }
        $this->startBefore = $values['startBefore'] ?? null;
        if (array_key_exists('startBefore', $values)) {
            $this->_setField('startBefore');
        }
    }
}
