<?php

namespace Coss\Sign\Templates\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Sign\Templates\Types\CreateSignRequestFromTemplateRequestSignersItem;
use Coss\Core\Types\ArrayType;
use Coss\Sign\Templates\Types\CreateSignRequestFromTemplateRequestSigningOrder;
use DateTime;
use Coss\Core\Types\Date;

class CreateSignRequestFromTemplateRequest extends JsonSerializableType
{
    /**
     * @var ?string $idempotencyKey Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
     */
    public ?string $idempotencyKey;

    /**
     * @var ?string $title Default: the template's title (else its name).
     */
    #[JsonProperty('title')]
    public ?string $title;

    /**
     * @var ?string $message Default: the template's message.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var array<CreateSignRequestFromTemplateRequestSignersItem> $signers One signer for each of the template's roles.
     */
    #[JsonProperty('signers'), ArrayType([CreateSignRequestFromTemplateRequestSignersItem::class])]
    public array $signers;

    /**
     * @var ?array<string, string> $mergeFields Values of the template's merge fields, by `merge_key`.
     */
    #[JsonProperty('merge_fields'), ArrayType(['string' => 'string'])]
    public ?array $mergeFields;

    /**
     * @var ?value-of<CreateSignRequestFromTemplateRequestSigningOrder> $signingOrder Default: the template's.
     */
    #[JsonProperty('signing_order')]
    public ?string $signingOrder;

    /**
     * @var ?DateTime $expiresAt When an unfinished request expires, at most 365 days ahead.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $expiresAt;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs, returned with the request and its webhooks.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?int $reminderIntervalDays Days between reminders to email signers. Default: your Sign settings'. `null`: none.
     */
    #[JsonProperty('reminder_interval_days')]
    public ?int $reminderIntervalDays;

    /**
     * @var ?bool $send Default `true`.
     */
    #[JsonProperty('send')]
    public ?bool $send;

    /**
     * @param array{
     *   signers: array<CreateSignRequestFromTemplateRequestSignersItem>,
     *   idempotencyKey?: ?string,
     *   title?: ?string,
     *   message?: ?string,
     *   mergeFields?: ?array<string, string>,
     *   signingOrder?: ?value-of<CreateSignRequestFromTemplateRequestSigningOrder>,
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
        $this->title = $values['title'] ?? null;
        if (array_key_exists('title', $values)) {
            $this->_setField('title');
        }
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->signers = $values['signers'];
        $this->mergeFields = $values['mergeFields'] ?? null;
        if (array_key_exists('mergeFields', $values)) {
            $this->_setField('mergeFields');
        }
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
