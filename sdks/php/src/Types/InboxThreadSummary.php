<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class InboxThreadSummary extends JsonSerializableType
{
    /**
     * @var value-of<InboxThreadSummaryObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $inboxId The inbox's id.
     */
    #[JsonProperty('inbox_id')]
    public string $inboxId;

    /**
     * @var ?string $subject The first message's subject.
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var array<string> $participants Addresses of everyone in the conversation but the inbox (Bcc'd ones never).
     */
    #[JsonProperty('participants'), ArrayType(['string'])]
    public array $participants;

    /**
     * @var int $messageCount Messages in the thread.
     */
    #[JsonProperty('message_count')]
    public int $messageCount;

    /**
     * @var ?string $preview The start of the latest message.
     */
    #[JsonProperty('preview')]
    public ?string $preview;

    /**
     * @var DateTime $lastMessageAt When its latest message was received or sent.
     */
    #[JsonProperty('last_message_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $lastMessageAt;

    /**
     * @var ?DateTime $lastInboundAt When its latest inbound message arrived: later than `last_message_at`'s outbound one means the conversation awaits a reply.
     */
    #[JsonProperty('last_inbound_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastInboundAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<InboxThreadSummaryObject>,
     *   id: string,
     *   inboxId: string,
     *   participants: array<string>,
     *   messageCount: int,
     *   lastMessageAt: DateTime,
     *   createdAt: DateTime,
     *   subject?: ?string,
     *   preview?: ?string,
     *   lastInboundAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->inboxId = $values['inboxId'];
        $this->subject = $values['subject'] ?? null;
        if (array_key_exists('subject', $values)) {
            $this->_setField('subject');
        }
        $this->participants = $values['participants'];
        $this->messageCount = $values['messageCount'];
        $this->preview = $values['preview'] ?? null;
        if (array_key_exists('preview', $values)) {
            $this->_setField('preview');
        }
        $this->lastMessageAt = $values['lastMessageAt'];
        $this->lastInboundAt = $values['lastInboundAt'] ?? null;
        if (array_key_exists('lastInboundAt', $values)) {
            $this->_setField('lastInboundAt');
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
