<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class InboxMessageSummary extends JsonSerializableType
{
    /**
     * @var value-of<InboxMessageSummaryObject> $object
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
     * @var value-of<InboxMessageSummaryDirection> $direction `inbound`: received by the inbox. `outbound`: sent from it.
     */
    #[JsonProperty('direction')]
    public string $direction;

    /**
     * @var value-of<InboxMessageSummaryStatus> $status `received` for inbound messages; an outbound message's email status (`queued`, `sent`, `failed`, …): its email has each recipient's delivery.
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
     * @param array{
     *   object: value-of<InboxMessageSummaryObject>,
     *   id: string,
     *   inboxId: string,
     *   threadId: string,
     *   direction: value-of<InboxMessageSummaryDirection>,
     *   status: value-of<InboxMessageSummaryStatus>,
     *   to: array<string>,
     *   cc: array<string>,
     *   attachments: array<ReceivedEmailAttachment>,
     *   spam: bool,
     *   createdAt: DateTime,
     *   from?: ?string,
     *   subject?: ?string,
     *   preview?: ?string,
     *   receivedEmailId?: ?string,
     *   emailId?: ?string,
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
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
