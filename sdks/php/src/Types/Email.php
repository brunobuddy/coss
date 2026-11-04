<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Email extends JsonSerializableType
{
    /**
     * @var value-of<EmailObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $from Who it's sent from.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var array<string> $to The `To` addresses.
     */
    #[JsonProperty('to'), ArrayType(['string'])]
    public array $to;

    /**
     * @var array<string> $cc The `Cc` addresses.
     */
    #[JsonProperty('cc'), ArrayType(['string'])]
    public array $cc;

    /**
     * @var array<string> $bcc The `Bcc` addresses.
     */
    #[JsonProperty('bcc'), ArrayType(['string'])]
    public array $bcc;

    /**
     * @var array<string> $replyTo The `Reply-To` addresses.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public array $replyTo;

    /**
     * @var string $subject The subject, rendered if it came from a template.
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $html The HTML part. `null`: none, or the body was discarded.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The plain text part. `null`: none, or the body was discarded.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var array<string, string> $headers The custom headers it was sent with.
     */
    #[JsonProperty('headers'), ArrayType(['string' => 'string'])]
    public array $headers;

    /**
     * @var array<EmailTagsItem> $tags Your tags on the email.
     */
    #[JsonProperty('tags'), ArrayType([EmailTagsItem::class])]
    public array $tags;

    /**
     * @var ?string $category The email's category, which suppressions and tracking rules can scope to. `null`: none.
     */
    #[JsonProperty('category')]
    public ?string $category;

    /**
     * @var value-of<EmailStream> $stream `transactional` or `marketing`.
     */
    #[JsonProperty('stream')]
    public string $stream;

    /**
     * @var value-of<EmailStatus> $status Whether the email was handed to the delivery provider. `scheduled` emails wait for `scheduled_at`; `canceled` ones were canceled before that. Per-recipient delivery is in `recipients`.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?EmailFailure $failure Why the email failed; `null` unless `status` is `failed`.
     */
    #[JsonProperty('failure')]
    public ?EmailFailure $failure;

    /**
     * @var array<EmailRecipient> $recipients Each recipient, with how delivery to them went.
     */
    #[JsonProperty('recipients'), ArrayType([EmailRecipient::class])]
    public array $recipients;

    /**
     * @var array<EmailAttachment> $attachments Attachment metadata. Content is never returned, and is discarded once sent.
     */
    #[JsonProperty('attachments'), ArrayType([EmailAttachment::class])]
    public array $attachments;

    /**
     * @var bool $sandbox True when sent from a sandbox environment (never delivered).
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var EmailTracking $tracking
     */
    #[JsonProperty('tracking')]
    public EmailTracking $tracking;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var ?DateTime $sentAt When it was handed to the provider. `null`: not yet.
     */
    #[JsonProperty('sent_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $sentAt;

    /**
     * @var ?DateTime $scheduledAt When the email was scheduled to be sent; `null` if it was not.
     */
    #[JsonProperty('scheduled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $scheduledAt;

    /**
     * @var ?string $batchId The batch that sent the email; `null` if it was sent on its own.
     */
    #[JsonProperty('batch_id')]
    public ?string $batchId;

    /**
     * @var ?EmailTemplateReference $template The template the email was rendered from; `null` if it was sent without one.
     */
    #[JsonProperty('template')]
    public ?EmailTemplateReference $template;

    /**
     * @var ?string $broadcastId The broadcast the email is part of; `null` for any other email.
     */
    #[JsonProperty('broadcast_id')]
    public ?string $broadcastId;

    /**
     * @var ?string $subaccountId The sub-account the email was sent for; `null` if it was sent for none.
     */
    #[JsonProperty('subaccount_id')]
    public ?string $subaccountId;

    /**
     * @var EmailContentStorage $contentStorage
     */
    #[JsonProperty('content_storage')]
    public EmailContentStorage $contentStorage;

    /**
     * @param array{
     *   object: value-of<EmailObject>,
     *   id: string,
     *   from: string,
     *   to: array<string>,
     *   cc: array<string>,
     *   bcc: array<string>,
     *   replyTo: array<string>,
     *   subject: string,
     *   headers: array<string, string>,
     *   tags: array<EmailTagsItem>,
     *   stream: value-of<EmailStream>,
     *   status: value-of<EmailStatus>,
     *   recipients: array<EmailRecipient>,
     *   attachments: array<EmailAttachment>,
     *   sandbox: bool,
     *   tracking: EmailTracking,
     *   createdAt: DateTime,
     *   contentStorage: EmailContentStorage,
     *   html?: ?string,
     *   text?: ?string,
     *   category?: ?string,
     *   failure?: ?EmailFailure,
     *   sentAt?: ?DateTime,
     *   scheduledAt?: ?DateTime,
     *   batchId?: ?string,
     *   template?: ?EmailTemplateReference,
     *   broadcastId?: ?string,
     *   subaccountId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->cc = $values['cc'];
        $this->bcc = $values['bcc'];
        $this->replyTo = $values['replyTo'];
        $this->subject = $values['subject'];
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->headers = $values['headers'];
        $this->tags = $values['tags'];
        $this->category = $values['category'] ?? null;
        if (array_key_exists('category', $values)) {
            $this->_setField('category');
        }
        $this->stream = $values['stream'];
        $this->status = $values['status'];
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->recipients = $values['recipients'];
        $this->attachments = $values['attachments'];
        $this->sandbox = $values['sandbox'];
        $this->tracking = $values['tracking'];
        $this->createdAt = $values['createdAt'];
        $this->sentAt = $values['sentAt'] ?? null;
        if (array_key_exists('sentAt', $values)) {
            $this->_setField('sentAt');
        }
        $this->scheduledAt = $values['scheduledAt'] ?? null;
        if (array_key_exists('scheduledAt', $values)) {
            $this->_setField('scheduledAt');
        }
        $this->batchId = $values['batchId'] ?? null;
        if (array_key_exists('batchId', $values)) {
            $this->_setField('batchId');
        }
        $this->template = $values['template'] ?? null;
        if (array_key_exists('template', $values)) {
            $this->_setField('template');
        }
        $this->broadcastId = $values['broadcastId'] ?? null;
        if (array_key_exists('broadcastId', $values)) {
            $this->_setField('broadcastId');
        }
        $this->subaccountId = $values['subaccountId'] ?? null;
        if (array_key_exists('subaccountId', $values)) {
            $this->_setField('subaccountId');
        }
        $this->contentStorage = $values['contentStorage'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
