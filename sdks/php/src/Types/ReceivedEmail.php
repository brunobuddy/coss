<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class ReceivedEmail extends JsonSerializableType
{
    /**
     * @var value-of<ReceivedEmailObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var value-of<ReceivedEmailStatus> $status `received`, or `blocked` when the message carried a virus: then only its envelope and verdicts are kept, never its content.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?value-of<ReceivedEmailBlockedReason> $blockedReason Why it's `blocked`. `null`: it isn't.
     */
    #[JsonProperty('blocked_reason')]
    public ?string $blockedReason;

    /**
     * @var string $mailFrom The envelope sender (`MAIL FROM`); empty for bounces.
     */
    #[JsonProperty('mail_from')]
    public string $mailFrom;

    /**
     * @var array<string> $recipients The envelope recipients this environment received the message for (Bcc'd addresses included, other organizations' never).
     */
    #[JsonProperty('recipients'), ArrayType(['string'])]
    public array $recipients;

    /**
     * @var ?string $from The `From` header.
     */
    #[JsonProperty('from')]
    public ?string $from;

    /**
     * @var array<string> $to The `To` header's addresses.
     */
    #[JsonProperty('to'), ArrayType(['string'])]
    public array $to;

    /**
     * @var array<string> $cc The `Cc` header's addresses.
     */
    #[JsonProperty('cc'), ArrayType(['string'])]
    public array $cc;

    /**
     * @var ?string $subject The `Subject` header. `null`: none.
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $messageId The `Message-ID` header.
     */
    #[JsonProperty('message_id')]
    public ?string $messageId;

    /**
     * @var array<ReceivedEmailAttachment> $attachments Its attachments, without their bytes.
     */
    #[JsonProperty('attachments'), ArrayType([ReceivedEmailAttachment::class])]
    public array $attachments;

    /**
     * @var int $size Size of the raw message in bytes.
     */
    #[JsonProperty('size')]
    public int $size;

    /**
     * @var bool $spam Whether the spam verdict is `fail`.
     */
    #[JsonProperty('spam')]
    public bool $spam;

    /**
     * @var ReceivedEmailVerdicts $verdicts
     */
    #[JsonProperty('verdicts')]
    public ReceivedEmailVerdicts $verdicts;

    /**
     * @var bool $sandbox Whether it was received by a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $receivedAt When it arrived.
     */
    #[JsonProperty('received_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $receivedAt;

    /**
     * @var array<string> $replyTo The `Reply-To` header's addresses.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public array $replyTo;

    /**
     * @var ?string $inReplyTo The `In-Reply-To` header. `null`: none.
     */
    #[JsonProperty('in_reply_to')]
    public ?string $inReplyTo;

    /**
     * @var array<string> $references Message ids of the `References` header.
     */
    #[JsonProperty('references'), ArrayType(['string'])]
    public array $references;

    /**
     * @var ?DateTime $sentAt The `Date` header, when valid.
     */
    #[JsonProperty('sent_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $sentAt;

    /**
     * @var array<ReceivedEmailHeadersItem> $headers Every header in message order (duplicates included).
     */
    #[JsonProperty('headers'), ArrayType([ReceivedEmailHeadersItem::class])]
    public array $headers;

    /**
     * @var ?string $text The plain text body. `null`: none, or it's `blocked`.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?string $html The HTML body. `null`: none, or it's `blocked`.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var bool $truncated Whether `text`, `html` or `headers` were shortened (2 MB per body, 64 KB of headers). The raw message always has all of it.
     */
    #[JsonProperty('truncated')]
    public bool $truncated;

    /**
     * @param array{
     *   object: value-of<ReceivedEmailObject>,
     *   id: string,
     *   status: value-of<ReceivedEmailStatus>,
     *   mailFrom: string,
     *   recipients: array<string>,
     *   to: array<string>,
     *   cc: array<string>,
     *   attachments: array<ReceivedEmailAttachment>,
     *   size: int,
     *   spam: bool,
     *   verdicts: ReceivedEmailVerdicts,
     *   sandbox: bool,
     *   receivedAt: DateTime,
     *   replyTo: array<string>,
     *   references: array<string>,
     *   headers: array<ReceivedEmailHeadersItem>,
     *   truncated: bool,
     *   blockedReason?: ?value-of<ReceivedEmailBlockedReason>,
     *   from?: ?string,
     *   subject?: ?string,
     *   messageId?: ?string,
     *   inReplyTo?: ?string,
     *   sentAt?: ?DateTime,
     *   text?: ?string,
     *   html?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->status = $values['status'];
        $this->blockedReason = $values['blockedReason'] ?? null;
        if (array_key_exists('blockedReason', $values)) {
            $this->_setField('blockedReason');
        }
        $this->mailFrom = $values['mailFrom'];
        $this->recipients = $values['recipients'];
        $this->from = $values['from'] ?? null;
        if (array_key_exists('from', $values)) {
            $this->_setField('from');
        }
        $this->to = $values['to'];
        $this->cc = $values['cc'];
        $this->subject = $values['subject'] ?? null;
        if (array_key_exists('subject', $values)) {
            $this->_setField('subject');
        }
        $this->messageId = $values['messageId'] ?? null;
        if (array_key_exists('messageId', $values)) {
            $this->_setField('messageId');
        }
        $this->attachments = $values['attachments'];
        $this->size = $values['size'];
        $this->spam = $values['spam'];
        $this->verdicts = $values['verdicts'];
        $this->sandbox = $values['sandbox'];
        $this->receivedAt = $values['receivedAt'];
        $this->replyTo = $values['replyTo'];
        $this->inReplyTo = $values['inReplyTo'] ?? null;
        if (array_key_exists('inReplyTo', $values)) {
            $this->_setField('inReplyTo');
        }
        $this->references = $values['references'];
        $this->sentAt = $values['sentAt'] ?? null;
        if (array_key_exists('sentAt', $values)) {
            $this->_setField('sentAt');
        }
        $this->headers = $values['headers'];
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->truncated = $values['truncated'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
