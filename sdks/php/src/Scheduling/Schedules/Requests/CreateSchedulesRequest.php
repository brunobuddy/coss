<?php

namespace Coss\Scheduling\Schedules\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\UpsertScheduleRequest;

class CreateSchedulesRequest extends JsonSerializableType
{
    /**
     * @var UpsertScheduleRequest $body
     */
    public UpsertScheduleRequest $body;

    /**
     * @param array{
     *   body: UpsertScheduleRequest,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->body = $values['body'];
    }
}
