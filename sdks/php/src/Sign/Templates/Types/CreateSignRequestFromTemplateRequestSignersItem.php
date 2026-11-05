<?php

namespace Coss\Sign\Templates\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateSignRequestFromTemplateRequestSignersItem extends JsonSerializableType
{
    /**
     * @var string $role The `key` of the template's role they sign as.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var string $name Shown on the signing page and on the certificate.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $email Where a `delivery: email` signer gets their link.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?value-of<CreateSignRequestFromTemplateRequestSignersItemDelivery> $delivery `email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page.
     */
    #[JsonProperty('delivery')]
    public ?string $delivery;

    /**
     * @var ?int $order With `sequential` signing, signers sign in increasing `order`.
     */
    #[JsonProperty('order')]
    public ?int $order;

    /**
     * @var ?string $clientRef Your own id for the signer, recorded in the audit trail.
     */
    #[JsonProperty('client_ref')]
    public ?string $clientRef;

    /**
     * @param array{
     *   role: string,
     *   name: string,
     *   email: string,
     *   delivery?: ?value-of<CreateSignRequestFromTemplateRequestSignersItemDelivery>,
     *   order?: ?int,
     *   clientRef?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->role = $values['role'];
        $this->name = $values['name'];
        $this->email = $values['email'];
        $this->delivery = $values['delivery'] ?? null;
        if (array_key_exists('delivery', $values)) {
            $this->_setField('delivery');
        }
        $this->order = $values['order'] ?? null;
        if (array_key_exists('order', $values)) {
            $this->_setField('order');
        }
        $this->clientRef = $values['clientRef'] ?? null;
        if (array_key_exists('clientRef', $values)) {
            $this->_setField('clientRef');
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
