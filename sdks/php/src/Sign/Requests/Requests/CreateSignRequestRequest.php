<?php

namespace Coss\Sign\Requests\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Sign\Requests\Types\CreateSignRequestRequestDocumentsItemDocumentId;
use Coss\Sign\Requests\Types\CreateSignRequestRequestDocumentsItemContent;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Sign\Requests\Types\CreateSignRequestRequestSignersItem;
use Coss\Sign\Requests\Types\CreateSignRequestRequestSigningOrder;
use DateTime;
use Coss\Core\Types\Date;

class CreateSignRequestRequest extends JsonSerializableType
{
    /**
     * @var ?string $idempotencyKey Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
     */
    public ?string $idempotencyKey;

    /**
     * @var string $title Shown to signers.
     */
    #[JsonProperty('title')]
    public string $title;

    /**
     * @var ?string $message A note to signers.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var array<(
     *    CreateSignRequestRequestDocumentsItemDocumentId
     *   |CreateSignRequestRequestDocumentsItemContent
     * )> $documents Uploaded documents by id, or PDFs inline (base64).
     */
    #[JsonProperty('documents'), ArrayType([new Union(CreateSignRequestRequestDocumentsItemDocumentId::class, CreateSignRequestRequestDocumentsItemContent::class)])]
    public array $documents;

    /**
     * @var array<CreateSignRequestRequestSignersItem> $signers Who signs, and what each fills.
     */
    #[JsonProperty('signers'), ArrayType([CreateSignRequestRequestSignersItem::class])]
    public array $signers;

    /**
     * @var ?value-of<CreateSignRequestRequestSigningOrder> $signingOrder `parallel` (default): everyone at once. `sequential`: in each signer's `order`.
     */
    #[JsonProperty('signing_order')]
    public ?string $signingOrder;

    /**
     * @var ?DateTime $expiresAt When unsigned requests expire (at most 365 days ahead).
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs, returned with the request and its webhooks.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?int $reminderIntervalDays Email signers who haven't signed get a reminder every this many days (up to 3). Default: your Sign settings' `reminder_interval_days`; `null`: none.
     */
    #[JsonProperty('reminder_interval_days')]
    public ?int $reminderIntervalDays;

    /**
     * @var ?bool $send Default `true`: send at once. `false` keeps a `draft` to send later.
     */
    #[JsonProperty('send')]
    public ?bool $send;

    /**
     * @param array{
     *   title: string,
     *   documents: array<(
     *    CreateSignRequestRequestDocumentsItemDocumentId
     *   |CreateSignRequestRequestDocumentsItemContent
     * )>,
     *   signers: array<CreateSignRequestRequestSignersItem>,
     *   idempotencyKey?: ?string,
     *   message?: ?string,
     *   signingOrder?: ?value-of<CreateSignRequestRequestSigningOrder>,
     *   expiresAt?: ?DateTime,
     *   metadata?: ?array<string, string>,
     *   reminderIntervalDays?: ?int,
     *   send?: ?bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->idempotencyKey = $values['idempotencyKey'] ?? null;
        if (array_key_exists('idempotencyKey', $values)) {
            $this->_setField('idempotencyKey');
        }
        $this->title = $values['title'];
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->documents = $values['documents'];
        $this->signers = $values['signers'];
        $this->signingOrder = $values['signingOrder'] ?? null;
        if (array_key_exists('signingOrder', $values)) {
            $this->_setField('signingOrder');
        }
        $this->expiresAt = $values['expiresAt'] ?? null;
        if (array_key_exists('expiresAt', $values)) {
            $this->_setField('expiresAt');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->reminderIntervalDays = $values['reminderIntervalDays'] ?? null;
        if (array_key_exists('reminderIntervalDays', $values)) {
            $this->_setField('reminderIntervalDays');
        }
        $this->send = $values['send'] ?? null;
        if (array_key_exists('send', $values)) {
            $this->_setField('send');
        }
    }
}
