<?php

namespace Coss\Scheduling\Attendees\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class EraseSchedulingAttendeeByEmailRequest extends JsonSerializableType
{
    /**
     * @var string $email The address to forget, an attendee's or a guest's.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @param array{
     *   email: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->email = $values['email'];
    }
}
