<?php

namespace Coss\Inboxes\Messages\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;
use Coss\Types\SendEmailAttachment;
use Coss\Core\Types\ArrayType;
use Coss\Inboxes\Messages\Types\SendInboxMessageRequestTagsItem;

class SendInboxMessageRequest extends JsonSerializableType
{
    /**
     * @var ?string $idempotencyKey Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
     */
    public ?string $idempotencyKey;

    /**
     * @var (
     *    string
     *   |array<string>
     * ) $to Who it goes to.
     */
    #[JsonProperty('to'), Union('string', ['string'])]
    public string|array $to;

    /**
     * @var (
     *    string
     *   |array<string>
     * )|null $cc Who it's copied to.
     */
    #[JsonProperty('cc'), Union('string', ['string'], 'null')]
    public string|array|null $cc;

    /**
     * @var (
     *    string
     *   |array<string>
     * )|null $bcc Who it's blind copied to.
     */
    #[JsonProperty('bcc'), Union('string', ['string'], 'null')]
    public string|array|null $bcc;

    /**
     * @var string $subject The new thread's subject.
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $text Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?string $html HTML body. Provide `html`, `text`, or both.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?array<SendEmailAttachment> $attachments Up to 20 files, at most 25 MB combined.
     */
    #[JsonProperty('attachments'), ArrayType([SendEmailAttachment::class])]
    public ?array $attachments;

    /**
     * @var ?array<SendInboxMessageRequestTagsItem> $tags Your tags on the email.
     */
    #[JsonProperty('tags'), ArrayType([SendInboxMessageRequestTagsItem::class])]
    public ?array $tags;

    /**
     * @param array{
     *   to: (
     *    string
     *   |array<string>
     * ),
     *   subject: string,
     *   idempotencyKey?: ?string,
     *   cc?: (
     *    string
     *   |array<string>
     * )|null,
     *   bcc?: (
     *    string
     *   |array<string>
     * )|null,
     *   text?: ?string,
     *   html?: ?string,
     *   attachments?: ?array<SendEmailAttachment>,
     *   tags?: ?array<SendInboxMessageRequestTagsItem>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->idempotencyKey = $values['idempotencyKey'] ?? null;
        if (array_key_exists('idempotencyKey', $values)) {
            $this->_setField('idempotencyKey');
        }
        $this->to = $values['to'];
        $this->cc = $values['cc'] ?? null;
        if (array_key_exists('cc', $values)) {
            $this->_setField('cc');
        }
        $this->bcc = $values['bcc'] ?? null;
        if (array_key_exists('bcc', $values)) {
            $this->_setField('bcc');
        }
        $this->subject = $values['subject'];
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->attachments = $values['attachments'] ?? null;
        if (array_key_exists('attachments', $values)) {
            $this->_setField('attachments');
        }
        $this->tags = $values['tags'] ?? null;
        if (array_key_exists('tags', $values)) {
            $this->_setField('tags');
        }
    }
}
