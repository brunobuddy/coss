<?php

namespace Coss\Sign\Requests\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\SignFieldInputDocument;
use Coss\Types\SignFieldInputAnchor;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class CreateSignRequestRequestSignersItem extends JsonSerializableType
{
    /**
     * @var string $name Shown on the signing page and on the certificate.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $email Where a `delivery: email` signer gets their link. Unique within a request.
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var ?value-of<CreateSignRequestRequestSignersItemDelivery> $delivery `email` (default): coss.com emails the signer a link. `embedded`: your app shows the signing page (create a session) and vouches for who the signer is.
     */
    #[JsonProperty('delivery')]
    public ?string $delivery;

    /**
     * @var ?int $order With `signing_order: "sequential"`, signers sign in increasing `order` (default: their position in `signers`).
     */
    #[JsonProperty('order')]
    public ?int $order;

    /**
     * @var ?string $clientRef Your own id for the signer, recorded in the audit trail.
     */
    #[JsonProperty('client_ref')]
    public ?string $clientRef;

    /**
     * @var array<(
     *    SignFieldInputDocument
     *   |SignFieldInputAnchor
     * )> $fields What this signer fills. Every signer needs at least one `signature` field.
     */
    #[JsonProperty('fields'), ArrayType([new Union(SignFieldInputDocument::class, SignFieldInputAnchor::class)])]
    public array $fields;

    /**
     * @param array{
     *   name: string,
     *   email: string,
     *   fields: array<(
     *    SignFieldInputDocument
     *   |SignFieldInputAnchor
     * )>,
     *   delivery?: ?value-of<CreateSignRequestRequestSignersItemDelivery>,
     *   order?: ?int,
     *   clientRef?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
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
        $this->fields = $values['fields'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
