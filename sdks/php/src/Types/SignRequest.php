<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class SignRequest extends JsonSerializableType
{
    /**
     * @var value-of<SignRequestObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<SignRequestStatus> $status `draft` until sent, `sent` while signers sign, then `completed` (everyone signed), `declined` (a signer declined), `canceled` or `expired`.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var string $title Shown to signers.
     */
    #[JsonProperty('title')]
    public string $title;

    /**
     * @var ?string $message A note to signers. `null`: none.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var value-of<SignRequestSigningOrder> $signingOrder `parallel`: everyone at once. `sequential`: in each signer's `order`.
     */
    #[JsonProperty('signing_order')]
    public string $signingOrder;

    /**
     * @var array<SignRequestDocumentsItem> $documents The documents to sign, in order.
     */
    #[JsonProperty('documents'), ArrayType([SignRequestDocumentsItem::class])]
    public array $documents;

    /**
     * @var array<SignSigner> $signers Who signs.
     */
    #[JsonProperty('signers'), ArrayType([SignSigner::class])]
    public array $signers;

    /**
     * @var array<SignField> $fields What each signer fills.
     */
    #[JsonProperty('fields'), ArrayType([SignField::class])]
    public array $fields;

    /**
     * @var array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public array $metadata;

    /**
     * @var bool $sandbox Whether it belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var ?int $reminderIntervalDays Days between automatic reminders to email signers; `null`: none.
     */
    #[JsonProperty('reminder_interval_days')]
    public ?int $reminderIntervalDays;

    /**
     * @var ?DateTime $expiresAt When it expires if it isn't finished. `null`: never.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @var ?DateTime $expiredAt When it expired. `null`: it hasn't.
     */
    #[JsonProperty('expired_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiredAt;

    /**
     * @var ?DateTime $sentAt When it was sent. `null`: still a draft.
     */
    #[JsonProperty('sent_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $sentAt;

    /**
     * @var ?DateTime $completedAt When the last signer signed. `null`: not yet.
     */
    #[JsonProperty('completed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $completedAt;

    /**
     * @var ?DateTime $canceledAt When it was canceled. `null`: it wasn't.
     */
    #[JsonProperty('canceled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $canceledAt;

    /**
     * @var ?DateTime $declinedAt When a signer declined it. `null`: nobody has.
     */
    #[JsonProperty('declined_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $declinedAt;

    /**
     * @var ?SignRequestSignedDocument $signedDocument The completed document, sealed by coss.com: every document with the signatures and values filled in, and a certificate of completion. `null` until it is ready (shortly after `completed`, announced by the `sign_request.completed` webhook); download it from `GET /v1/sign/requests/{id}/signed_document`.
     */
    #[JsonProperty('signed_document')]
    public ?SignRequestSignedDocument $signedDocument;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<SignRequestObject>,
     *   id: string,
     *   status: value-of<SignRequestStatus>,
     *   title: string,
     *   signingOrder: value-of<SignRequestSigningOrder>,
     *   documents: array<SignRequestDocumentsItem>,
     *   signers: array<SignSigner>,
     *   fields: array<SignField>,
     *   metadata: array<string, string>,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   message?: ?string,
     *   reminderIntervalDays?: ?int,
     *   expiresAt?: ?DateTime,
     *   expiredAt?: ?DateTime,
     *   sentAt?: ?DateTime,
     *   completedAt?: ?DateTime,
     *   canceledAt?: ?DateTime,
     *   declinedAt?: ?DateTime,
     *   signedDocument?: ?SignRequestSignedDocument,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->status = $values['status'];
        $this->title = $values['title'];
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->signingOrder = $values['signingOrder'];
        $this->documents = $values['documents'];
        $this->signers = $values['signers'];
        $this->fields = $values['fields'];
        $this->metadata = $values['metadata'];
        $this->sandbox = $values['sandbox'];
        $this->reminderIntervalDays = $values['reminderIntervalDays'] ?? null;
        if (array_key_exists('reminderIntervalDays', $values)) {
            $this->_setField('reminderIntervalDays');
        }
        $this->expiresAt = $values['expiresAt'] ?? null;
        if (array_key_exists('expiresAt', $values)) {
            $this->_setField('expiresAt');
        }
        $this->expiredAt = $values['expiredAt'] ?? null;
        if (array_key_exists('expiredAt', $values)) {
            $this->_setField('expiredAt');
        }
        $this->sentAt = $values['sentAt'] ?? null;
        if (array_key_exists('sentAt', $values)) {
            $this->_setField('sentAt');
        }
        $this->completedAt = $values['completedAt'] ?? null;
        if (array_key_exists('completedAt', $values)) {
            $this->_setField('completedAt');
        }
        $this->canceledAt = $values['canceledAt'] ?? null;
        if (array_key_exists('canceledAt', $values)) {
            $this->_setField('canceledAt');
        }
        $this->declinedAt = $values['declinedAt'] ?? null;
        if (array_key_exists('declinedAt', $values)) {
            $this->_setField('declinedAt');
        }
        $this->signedDocument = $values['signedDocument'] ?? null;
        if (array_key_exists('signedDocument', $values)) {
            $this->_setField('signedDocument');
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
