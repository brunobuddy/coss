<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Verification extends JsonSerializableType
{
    /**
     * @var value-of<VerificationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<VerificationChannel> $channel `sms` or `email`.
     */
    #[JsonProperty('channel')]
    public string $channel;

    /**
     * @var string $to The phone number (E.164) or address the code goes to.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @var ?string $country ISO 3166 country of a phone number.
     */
    #[JsonProperty('country')]
    public ?string $country;

    /**
     * @var value-of<VerificationStatus> $status `pending` until the right code is checked (`approved`) or it ends: `expired`, `canceled`, `failed` (too many wrong codes, or the code couldn't be sent) or `blocked` (the fraud guard stopped it before anything was sent).
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?VerificationFailure $failure Why it `failed`.
     */
    #[JsonProperty('failure')]
    public ?VerificationFailure $failure;

    /**
     * @var array<VerificationReasonsItem> $reasons Why it was `blocked` (empty otherwise).
     */
    #[JsonProperty('reasons'), ArrayType([VerificationReasonsItem::class])]
    public array $reasons;

    /**
     * @var int $attempts Wrong codes checked so far.
     */
    #[JsonProperty('attempts')]
    public int $attempts;

    /**
     * @var int $maxAttempts How many wrong codes end it.
     */
    #[JsonProperty('max_attempts')]
    public int $maxAttempts;

    /**
     * @var array<VerificationSend> $sends Each time the code was sent.
     */
    #[JsonProperty('sends'), ArrayType([VerificationSend::class])]
    public array $sends;

    /**
     * @var array<VerificationTagsItem> $tags Your tags on the verification.
     */
    #[JsonProperty('tags'), ArrayType([VerificationTagsItem::class])]
    public array $tags;

    /**
     * @var bool $sandbox Made in a sandbox environment: simulated, and the code is always zeros.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $expiresAt When the code stops working.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $expiresAt;

    /**
     * @var ?DateTime $approvedAt When the right code was checked. `null`: it wasn't.
     */
    #[JsonProperty('approved_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $approvedAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<VerificationObject>,
     *   id: string,
     *   channel: value-of<VerificationChannel>,
     *   to: string,
     *   status: value-of<VerificationStatus>,
     *   reasons: array<VerificationReasonsItem>,
     *   attempts: int,
     *   maxAttempts: int,
     *   sends: array<VerificationSend>,
     *   tags: array<VerificationTagsItem>,
     *   sandbox: bool,
     *   expiresAt: DateTime,
     *   createdAt: DateTime,
     *   country?: ?string,
     *   failure?: ?VerificationFailure,
     *   approvedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->channel = $values['channel'];
        $this->to = $values['to'];
        $this->country = $values['country'] ?? null;
        if (array_key_exists('country', $values)) {
            $this->_setField('country');
        }
        $this->status = $values['status'];
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->reasons = $values['reasons'];
        $this->attempts = $values['attempts'];
        $this->maxAttempts = $values['maxAttempts'];
        $this->sends = $values['sends'];
        $this->tags = $values['tags'];
        $this->sandbox = $values['sandbox'];
        $this->expiresAt = $values['expiresAt'];
        $this->approvedAt = $values['approvedAt'] ?? null;
        if (array_key_exists('approvedAt', $values)) {
            $this->_setField('approvedAt');
        }
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
