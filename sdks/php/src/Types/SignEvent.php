<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SignEvent extends JsonSerializableType
{
    /**
     * @var value-of<SignEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var int $sequence 1-based position in the request's trail.
     */
    #[JsonProperty('sequence')]
    public int $sequence;

    /**
     * @var value-of<SignEventType> $type What happened. `created`, `sent`, `canceled` and `expired` concern the request; `notified`, `reminded`, `viewed`, `consented`, `signed` and `declined` a signer; `completed` is the last signature and `sealed` the sealed document being ready.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?string $signerId The id of the signer it concerns. `null`: the whole request.
     */
    #[JsonProperty('signer_id')]
    public ?string $signerId;

    /**
     * @var value-of<SignEventActor> $actor Who did it: your API key, a signer, a member in the dashboard, or coss.com.
     */
    #[JsonProperty('actor')]
    public string $actor;

    /**
     * @var ?string $ipAddress The address the action came from. `null`: unknown, or coss.com acted.
     */
    #[JsonProperty('ip_address')]
    public ?string $ipAddress;

    /**
     * @var ?string $userAgent The client's `User-Agent`. `null`: unknown.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @var SignEventDetails $details What this event recorded, depending on its type.
     */
    #[JsonProperty('details')]
    public SignEventDetails $details;

    /**
     * @var DateTime $occurredAt When it happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var ?string $previousHash The previous event's `hash`. `null` on the first event.
     */
    #[JsonProperty('previous_hash')]
    public ?string $previousHash;

    /**
     * @var string $hash SHA-256 over this event and `previous_hash`: changing or removing an event breaks the chain from there on.
     */
    #[JsonProperty('hash')]
    public string $hash;

    /**
     * @param array{
     *   object: value-of<SignEventObject>,
     *   id: string,
     *   sequence: int,
     *   type: value-of<SignEventType>,
     *   actor: value-of<SignEventActor>,
     *   details: SignEventDetails,
     *   occurredAt: DateTime,
     *   hash: string,
     *   signerId?: ?string,
     *   ipAddress?: ?string,
     *   userAgent?: ?string,
     *   previousHash?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->sequence = $values['sequence'];
        $this->type = $values['type'];
        $this->signerId = $values['signerId'] ?? null;
        if (array_key_exists('signerId', $values)) {
            $this->_setField('signerId');
        }
        $this->actor = $values['actor'];
        $this->ipAddress = $values['ipAddress'] ?? null;
        if (array_key_exists('ipAddress', $values)) {
            $this->_setField('ipAddress');
        }
        $this->userAgent = $values['userAgent'] ?? null;
        if (array_key_exists('userAgent', $values)) {
            $this->_setField('userAgent');
        }
        $this->details = $values['details'];
        $this->occurredAt = $values['occurredAt'];
        $this->previousHash = $values['previousHash'] ?? null;
        if (array_key_exists('previousHash', $values)) {
            $this->_setField('previousHash');
        }
        $this->hash = $values['hash'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
