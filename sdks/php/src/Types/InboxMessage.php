<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class InboxMessage extends JsonSerializableType
{
    /**
     * @var value-of<InboxMessageObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $inboxId
     */
    #[JsonProperty('inbox_id')]
    public string $inboxId;

    /**
     * @var string $threadId
     */
    #[JsonProperty('thread_id')]
    public string $threadId;

    /**
     * @var value-of<InboxMessageDirection> $direction `inbound`: received by the inbox. `outbound`: sent from it.
     */
    #[JsonProperty('direction')]
    public string $direction;

    /**
     * @var value-of<InboxMessageStatus> $status `received` for inbound messages; an outbound message's email status (`queued`, `sent`, `failed`, …): its email has each recipient's delivery.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $from The `From` header.
     */
    #[JsonProperty('from')]
    public ?string $from;

    /**
     * @var array<string> $to Addresses in the `To` header.
     */
    #[JsonProperty('to'), ArrayType(['string'])]
    public array $to;

    /**
     * @var array<string> $cc Addresses in the `Cc` header.
     */
    #[JsonProperty('cc'), ArrayType(['string'])]
    public array $cc;

    /**
     * @var ?string $subject The subject. `null`: none.
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $preview The start of the message's own text (without the quoted conversation).
     */
    #[JsonProperty('preview')]
    public ?string $preview;

    /**
     * @var array<ReceivedEmailAttachment> $attachments An inbound message's attachments (download them from the message).
     */
    #[JsonProperty('attachments'), ArrayType([ReceivedEmailAttachment::class])]
    public array $attachments;

    /**
     * @var bool $spam Whether the receiving server judged it spam.
     */
    #[JsonProperty('spam')]
    public bool $spam;

    /**
     * @var ?string $receivedEmailId The received email of an inbound message.
     */
    #[JsonProperty('received_email_id')]
    public ?string $receivedEmailId;

    /**
     * @var ?string $emailId The email of an outbound message: its delivery events and webhooks name it.
     */
    #[JsonProperty('email_id')]
    public ?string $emailId;

    /**
     * @var DateTime $createdAt When it was received or sent.
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var array<string> $replyTo Addresses in the `Reply-To` header.
     */
    #[JsonProperty('reply_to'), ArrayType(['string'])]
    public array $replyTo;

    /**
     * @var ?string $messageId An inbound message's `Message-ID` header (outbound ones get theirs at sending).
     */
    #[JsonProperty('message_id')]
    public ?string $messageId;

    /**
     * @var ?string $inReplyTo The message it answers, by `Message-ID`. `null`: none.
     */
    #[JsonProperty('in_reply_to')]
    public ?string $inReplyTo;

    /**
     * @var array<string> $references The `Message-ID`s of the conversation so far.
     */
    #[JsonProperty('references'), ArrayType(['string'])]
    public array $references;

    /**
     * @var ?string $text The plain text part. `null`: none.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?string $extractedText The message's own text: `text` without the quoted conversation and signature below it (a heuristic; when nothing is left, all of `text`). Made from `html` when there is no `text`.
     */
    #[JsonProperty('extracted_text')]
    public ?string $extractedText;

    /**
     * @var ?string $html The sender's HTML: sanitize it before showing it to anyone.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var bool $truncated Whether `text` or `html` were shortened (2 MB each).
     */
    #[JsonProperty('truncated')]
    public bool $truncated;

    /**
     * @param array{
     *   object: value-of<InboxMessageObject>,
     *   id: string,
     *   inboxId: string,
     *   threadId: string,
     *   direction: value-of<InboxMessageDirection>,
     *   status: value-of<InboxMessageStatus>,
     *   to: array<string>,
     *   cc: array<string>,
     *   attachments: array<ReceivedEmailAttachment>,
     *   spam: bool,
     *   createdAt: DateTime,
     *   replyTo: array<string>,
     *   references: array<string>,
     *   truncated: bool,
     *   from?: ?string,
     *   subject?: ?string,
     *   preview?: ?string,
     *   receivedEmailId?: ?string,
     *   emailId?: ?string,
     *   messageId?: ?string,
     *   inReplyTo?: ?string,
     *   text?: ?string,
     *   extractedText?: ?string,
     *   html?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->inboxId = $values['inboxId'];
        $this->threadId = $values['threadId'];
        $this->direction = $values['direction'];
        $this->status = $values['status'];
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
        $this->preview = $values['preview'] ?? null;
        if (array_key_exists('preview', $values)) {
            $this->_setField('preview');
        }
        $this->attachments = $values['attachments'];
        $this->spam = $values['spam'];
        $this->receivedEmailId = $values['receivedEmailId'] ?? null;
        if (array_key_exists('receivedEmailId', $values)) {
            $this->_setField('receivedEmailId');
        }
        $this->emailId = $values['emailId'] ?? null;
        if (array_key_exists('emailId', $values)) {
            $this->_setField('emailId');
        }
        $this->createdAt = $values['createdAt'];
        $this->replyTo = $values['replyTo'];
        $this->messageId = $values['messageId'] ?? null;
        if (array_key_exists('messageId', $values)) {
            $this->_setField('messageId');
        }
        $this->inReplyTo = $values['inReplyTo'] ?? null;
        if (array_key_exists('inReplyTo', $values)) {
            $this->_setField('inReplyTo');
        }
        $this->references = $values['references'];
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->extractedText = $values['extractedText'] ?? null;
        if (array_key_exists('extractedText', $values)) {
            $this->_setField('extractedText');
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
