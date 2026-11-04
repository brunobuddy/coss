<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class ContactConfirmation extends JsonSerializableType
{
    /**
     * @var value-of<ContactConfirmationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $contactId The contact's id.
     */
    #[JsonProperty('contact_id')]
    public string $contactId;

    /**
     * @var value-of<ContactConfirmationStatus> $status `sent`; `cooldown` (one confirmation per contact per day); `limit_reached` (three were sent and none confirmed); `not_pending` (the contact isn't waiting to confirm).
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @param array{
     *   object: value-of<ContactConfirmationObject>,
     *   contactId: string,
     *   status: value-of<ContactConfirmationStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->contactId = $values['contactId'];
        $this->status = $values['status'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
