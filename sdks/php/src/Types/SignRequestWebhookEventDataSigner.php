<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The signer who viewed, signed or declined; `null` otherwise.
 */
class SignRequestWebhookEventDataSigner extends JsonSerializableType
{
    /**
     * @var string $id The signer's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name The signer's name.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $email The signer's email address.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?string $clientRef Your own id for the signer. `null`: none given.
     */
    #[JsonProperty('client_ref')]
    public ?string $clientRef;

    /**
     * @var value-of<SignRequestWebhookEventDataSignerStatus> $status The signer's status after the event.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @param array{
     *   id: string,
     *   name: string,
     *   email: string,
     *   status: value-of<SignRequestWebhookEventDataSignerStatus>,
     *   clientRef?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->email = $values['email'];
        $this->clientRef = $values['clientRef'] ?? null;
        if (array_key_exists('clientRef', $values)) {
            $this->_setField('clientRef');
        }
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
