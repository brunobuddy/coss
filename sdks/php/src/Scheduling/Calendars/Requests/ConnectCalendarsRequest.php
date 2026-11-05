<?php

namespace Coss\Scheduling\Calendars\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\CreateCalendarConnectionRequest;

class ConnectCalendarsRequest extends JsonSerializableType
{
    /**
     * @var CreateCalendarConnectionRequest $body
     */
    public CreateCalendarConnectionRequest $body;

    /**
     * @param array{
     *   body: CreateCalendarConnectionRequest,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->body = $values['body'];
    }
}
