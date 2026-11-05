<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SmsNumber extends JsonSerializableType
{
    /**
     * @var value-of<SmsNumberObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $phoneNumber The number, in E.164.
     */
    #[JsonProperty('phone_number')]
    public string $phoneNumber;

    /**
     * @var value-of<SmsNumberKind> $kind `local` (US A2P 10DLC) or `toll_free` (toll-free verification, and sends only to the US and Canada).
     */
    #[JsonProperty('kind')]
    public string $kind;

    /**
     * @var string $country Its country (ISO 3166-1 alpha-2).
     */
    #[JsonProperty('country')]
    public string $country;

    /**
     * @var value-of<SmsNumberStatus> $status `pending`: not ready yet. `active`: ready, once its registration is approved. `releasing`: being given up.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?value-of<SmsNumberRegistrationStatus> $registrationStatus Its carrier registration's status; live sends need `approved`.
     */
    #[JsonProperty('registration_status')]
    public ?string $registrationStatus;

    /**
     * @var bool $canSend Whether live sends can go from it now.
     */
    #[JsonProperty('can_send')]
    public bool $canSend;

    /**
     * @var bool $receivesHere Whether replies to it arrive in the environment of the key making the request.
     */
    #[JsonProperty('receives_here')]
    public bool $receivesHere;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<SmsNumberObject>,
     *   id: string,
     *   phoneNumber: string,
     *   kind: value-of<SmsNumberKind>,
     *   country: string,
     *   status: value-of<SmsNumberStatus>,
     *   canSend: bool,
     *   receivesHere: bool,
     *   createdAt: DateTime,
     *   registrationStatus?: ?value-of<SmsNumberRegistrationStatus>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->phoneNumber = $values['phoneNumber'];
        $this->kind = $values['kind'];
        $this->country = $values['country'];
        $this->status = $values['status'];
        $this->registrationStatus = $values['registrationStatus'] ?? null;
        if (array_key_exists('registrationStatus', $values)) {
            $this->_setField('registrationStatus');
        }
        $this->canSend = $values['canSend'];
        $this->receivesHere = $values['receivesHere'];
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
