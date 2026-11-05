<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\Union;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class SendEmailRequest extends JsonSerializableType
{
    /**
     * @var string $from An email address, optionally with a display name: "Acme <hello@acme.com>".
     */
    #[JsonProperty('from')]
    public string $from;

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
     * @var (
     *    string
     *   |array<string>
     * )|null $replyTo Where replies go.
     */
    #[JsonProperty('reply_to'), Union('string', ['string'], 'null')]
    public string|array|null $replyTo;

    /**
     * @var ?string $subject Required unless the email is sent from a template (`template_id`).
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $html HTML body. Provide `html`, `text`, or both.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @var ?string $templateId Send a published email template (its id or alias) instead of `subject`, `html` and `text`.
     */
    #[JsonProperty('template_id')]
    public ?string $templateId;

    /**
     * @var ?int $templateVersion A published version of the template to send. Defaults to the latest one.
     */
    #[JsonProperty('template_version')]
    public ?int $templateVersion;

    /**
     * @var ?string $locale The template locale to send, e.g. "pt-BR". Falls back to the language ("pt"), then to the template's default locale.
     */
    #[JsonProperty('locale')]
    public ?string $locale;

    /**
     * @var ?array<string, mixed> $variables Values for the template's variables, keyed by name.
     */
    #[JsonProperty('variables'), ArrayType(['string' => 'mixed'])]
    public ?array $variables;

    /**
     * @var ?array<string, string> $headers Up to 15 custom headers. Names are case-insensitive.
     */
    #[JsonProperty('headers'), ArrayType(['string' => 'string'])]
    public ?array $headers;

    /**
     * @var ?array<SendEmailRequestTagsItem> $tags Your tags on the email.
     */
    #[JsonProperty('tags'), ArrayType([SendEmailRequestTagsItem::class])]
    public ?array $tags;

    /**
     * @var ?string $category What kind of email this is, e.g. "marketing". Recipients suppressed for this category (or for every email) are skipped.
     */
    #[JsonProperty('category')]
    public ?string $category;

    /**
     * @var ?DateTime $scheduledAt Send the email at this time instead of now (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends immediately. Scheduled emails can be rescheduled or canceled until they are sent.
     */
    #[JsonProperty('scheduled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $scheduledAt;

    /**
     * @var ?array<SendEmailAttachment> $attachments Up to 20 files, at most 25 MB combined.
     */
    #[JsonProperty('attachments'), ArrayType([SendEmailAttachment::class])]
    public ?array $attachments;

    /**
     * @var ?TrackingOptions $tracking
     */
    #[JsonProperty('tracking')]
    public ?TrackingOptions $tracking;

    /**
     * @var ?value-of<SendEmailRequestStream> $stream `transactional` (the default) or `marketing`. Marketing email goes out on its own sending infrastructure and reputation, so its complaints never hold up transactional mail. It needs the environment's postal address (marketing settings), exactly one recipient, and no `List-Unsubscribe` header: coss.com adds one-click unsubscribe headers and a footer with the address and an unsubscribe link (place them yourself with `{{{unsubscribe_url}}}`, `{{{preferences_url}}}` and `{{{mailing_address}}}`). Contacts who unsubscribed are skipped.
     */
    #[JsonProperty('stream')]
    public ?string $stream;

    /**
     * @var ?string $subaccount Send for one of your sub-accounts (email for platforms): its id (`sub_…`) or your `uid` for it. The email then counts toward its quotas and reputation, skips its suppressions (and the environment's), and must come from one of its domains or a domain you share with sub-accounts. Transactional email only.
     */
    #[JsonProperty('subaccount')]
    public ?string $subaccount;

    /**
     * @param array{
     *   from: string,
     *   to: (
     *    string
     *   |array<string>
     * ),
     *   cc?: (
     *    string
     *   |array<string>
     * )|null,
     *   bcc?: (
     *    string
     *   |array<string>
     * )|null,
     *   replyTo?: (
     *    string
     *   |array<string>
     * )|null,
     *   subject?: ?string,
     *   html?: ?string,
     *   text?: ?string,
     *   templateId?: ?string,
     *   templateVersion?: ?int,
     *   locale?: ?string,
     *   variables?: ?array<string, mixed>,
     *   headers?: ?array<string, string>,
     *   tags?: ?array<SendEmailRequestTagsItem>,
     *   category?: ?string,
     *   scheduledAt?: ?DateTime,
     *   attachments?: ?array<SendEmailAttachment>,
     *   tracking?: ?TrackingOptions,
     *   stream?: ?value-of<SendEmailRequestStream>,
     *   subaccount?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->cc = $values['cc'] ?? null;
        if (array_key_exists('cc', $values)) {
            $this->_setField('cc');
        }
        $this->bcc = $values['bcc'] ?? null;
        if (array_key_exists('bcc', $values)) {
            $this->_setField('bcc');
        }
        $this->replyTo = $values['replyTo'] ?? null;
        if (array_key_exists('replyTo', $values)) {
            $this->_setField('replyTo');
        }
        $this->subject = $values['subject'] ?? null;
        if (array_key_exists('subject', $values)) {
            $this->_setField('subject');
        }
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
        }
        $this->templateId = $values['templateId'] ?? null;
        if (array_key_exists('templateId', $values)) {
            $this->_setField('templateId');
        }
        $this->templateVersion = $values['templateVersion'] ?? null;
        if (array_key_exists('templateVersion', $values)) {
            $this->_setField('templateVersion');
        }
        $this->locale = $values['locale'] ?? null;
        if (array_key_exists('locale', $values)) {
            $this->_setField('locale');
        }
        $this->variables = $values['variables'] ?? null;
        if (array_key_exists('variables', $values)) {
            $this->_setField('variables');
        }
        $this->headers = $values['headers'] ?? null;
        if (array_key_exists('headers', $values)) {
            $this->_setField('headers');
        }
        $this->tags = $values['tags'] ?? null;
        if (array_key_exists('tags', $values)) {
            $this->_setField('tags');
        }
        $this->category = $values['category'] ?? null;
        if (array_key_exists('category', $values)) {
            $this->_setField('category');
        }
        $this->scheduledAt = $values['scheduledAt'] ?? null;
        if (array_key_exists('scheduledAt', $values)) {
            $this->_setField('scheduledAt');
        }
        $this->attachments = $values['attachments'] ?? null;
        if (array_key_exists('attachments', $values)) {
            $this->_setField('attachments');
        }
        $this->tracking = $values['tracking'] ?? null;
        if (array_key_exists('tracking', $values)) {
            $this->_setField('tracking');
        }
        $this->stream = $values['stream'] ?? null;
        if (array_key_exists('stream', $values)) {
            $this->_setField('stream');
        }
        $this->subaccount = $values['subaccount'] ?? null;
        if (array_key_exists('subaccount', $values)) {
            $this->_setField('subaccount');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
