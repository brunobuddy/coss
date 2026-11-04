<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * Someone asked to sign.
 */
class SignSigner extends JsonSerializableType
{
    /**
     * @var value-of<SignSignerObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var string $email
     */
    #[JsonProperty('email')]
    public string $email;

    /**
     * @var int $order Where they come in `signing_order: sequential`. Lower signs first.
     */
    #[JsonProperty('order')]
    public int $order;

    /**
     * @var value-of<SignSignerDelivery> $delivery `email`: coss.com emails them a link. `embedded`: your app shows the signing page.
     */
    #[JsonProperty('delivery')]
    public string $delivery;

    /**
     * @var value-of<SignSignerAuthentication> $authentication How the signer is identified: `email_link` (they opened the link coss.com emailed) or `customer_asserted` (your app vouched for them).
     */
    #[JsonProperty('authentication')]
    public string $authentication;

    /**
     * @var value-of<SignSignerStatus> $status `pending`: not contacted yet. `notified`: emailed their link. `viewed`: opened the signing page. `signed`: done. `declined`: refused, which declines the whole request.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $clientRef Your own id for the signer. `null`: none given.
     */
    #[JsonProperty('client_ref')]
    public ?string $clientRef;

    /**
     * @var ?DateTime $viewedAt When they first opened the signing page. `null`: not yet.
     */
    #[JsonProperty('viewed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $viewedAt;

    /**
     * @var ?DateTime $signedAt When they signed. `null`: not yet.
     */
    #[JsonProperty('signed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $signedAt;

    /**
     * @var ?DateTime $declinedAt When they declined. `null`: they haven't.
     */
    #[JsonProperty('declined_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $declinedAt;

    /**
     * @var ?string $declineReason The reason they gave. `null`: none given.
     */
    #[JsonProperty('decline_reason')]
    public ?string $declineReason;

    /**
     * @param array{
     *   object: value-of<SignSignerObject>,
     *   id: string,
     *   name: string,
     *   email: string,
     *   order: int,
     *   delivery: value-of<SignSignerDelivery>,
     *   authentication: value-of<SignSignerAuthentication>,
     *   status: value-of<SignSignerStatus>,
     *   clientRef?: ?string,
     *   viewedAt?: ?DateTime,
     *   signedAt?: ?DateTime,
     *   declinedAt?: ?DateTime,
     *   declineReason?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->email = $values['email'];
        $this->order = $values['order'];
        $this->delivery = $values['delivery'];
        $this->authentication = $values['authentication'];
        $this->status = $values['status'];
        $this->clientRef = $values['clientRef'] ?? null;
        if (array_key_exists('clientRef', $values)) {
            $this->_setField('clientRef');
        }
        $this->viewedAt = $values['viewedAt'] ?? null;
        if (array_key_exists('viewedAt', $values)) {
            $this->_setField('viewedAt');
        }
        $this->signedAt = $values['signedAt'] ?? null;
        if (array_key_exists('signedAt', $values)) {
            $this->_setField('signedAt');
        }
        $this->declinedAt = $values['declinedAt'] ?? null;
        if (array_key_exists('declinedAt', $values)) {
            $this->_setField('declinedAt');
        }
        $this->declineReason = $values['declineReason'] ?? null;
        if (array_key_exists('declineReason', $values)) {
            $this->_setField('declineReason');
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
