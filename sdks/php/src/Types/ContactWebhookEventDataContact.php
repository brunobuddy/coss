<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class ContactWebhookEventDataContact extends JsonSerializableType
{
    /**
     * @var string $id The contact's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $email The contact's address.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var value-of<ContactWebhookEventDataContactStatus> $status Its consent after this event.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @param array{
     *   id: string,
     *   email: string,
     *   status: value-of<ContactWebhookEventDataContactStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->email = $values['email'];
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
