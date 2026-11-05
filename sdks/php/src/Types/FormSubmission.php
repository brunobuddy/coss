<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use DateTime;
use Coss\Core\Types\Date;

class FormSubmission extends JsonSerializableType
{
    /**
     * @var value-of<FormSubmissionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $formId The id of the form it was posted to.
     */
    #[JsonProperty('form_id')]
    public string $formId;

    /**
     * @var value-of<FormSubmissionStatus> $status `accepted`: delivered (webhooks, notifications, contacts). `held`: Risk asked for a review. `spam`: refused by Risk, the content check or the honeypot. `pending_confirmation`: waiting for the submitter's email link.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var array<string, (
     *    string
     *   |array<string>
     * )> $data Field name → value; a field posted several times has an array.
     */
    #[JsonProperty('data'), ArrayType(['string' => new Union('string', ['string'])])]
    public array $data;

    /**
     * @var ?string $submitterEmail The value of the form's `submitter.email_field`. `null` when it has none.
     */
    #[JsonProperty('submitter_email')]
    public ?string $submitterEmail;

    /**
     * @var array<FormSubmissionFile> $files Uploaded files. Download them with the API.
     */
    #[JsonProperty('files'), ArrayType([FormSubmissionFile::class])]
    public array $files;

    /**
     * @var ?value-of<FormSubmissionSpamReason> $spamReason Why it was flagged. `honeypot`: the honeypot field was filled. `risk_block`: Risk blocked it. `risk_review`: Risk asked for a review. `content`: its text passed `content_threshold`. `null`: not flagged.
     */
    #[JsonProperty('spam_reason')]
    public ?string $spamReason;

    /**
     * @var ?FormSubmissionRisk $risk Risk's assessment; `null` when none ran (honeypot).
     */
    #[JsonProperty('risk')]
    public ?FormSubmissionRisk $risk;

    /**
     * @var ?string $ip The address it was posted from. `null`: unknown.
     */
    #[JsonProperty('ip')]
    public ?string $ip;

    /**
     * @var ?string $userAgent The browser's `User-Agent`. `null`: not sent.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @var ?string $origin The site it was posted from. `null`: not sent.
     */
    #[JsonProperty('origin')]
    public ?string $origin;

    /**
     * @var ?string $referrer The page it was posted from. `null`: not sent.
     */
    #[JsonProperty('referrer')]
    public ?string $referrer;

    /**
     * @var ?DateTime $confirmedAt When the submitter clicked the emailed link. `null`: they haven't, or the form doesn't verify.
     */
    #[JsonProperty('confirmed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $confirmedAt;

    /**
     * @var ?DateTime $acceptedAt When it became `accepted`. `null`: it hasn't.
     */
    #[JsonProperty('accepted_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $acceptedAt;

    /**
     * @var ?DateTime $releasedAt When it was released from `held` or `spam`. `null`: it wasn't.
     */
    #[JsonProperty('released_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $releasedAt;

    /**
     * @var bool $sandbox Whether it belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<FormSubmissionObject>,
     *   id: string,
     *   formId: string,
     *   status: value-of<FormSubmissionStatus>,
     *   data: array<string, (
     *    string
     *   |array<string>
     * )>,
     *   files: array<FormSubmissionFile>,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   submitterEmail?: ?string,
     *   spamReason?: ?value-of<FormSubmissionSpamReason>,
     *   risk?: ?FormSubmissionRisk,
     *   ip?: ?string,
     *   userAgent?: ?string,
     *   origin?: ?string,
     *   referrer?: ?string,
     *   confirmedAt?: ?DateTime,
     *   acceptedAt?: ?DateTime,
     *   releasedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->formId = $values['formId'];
        $this->status = $values['status'];
        $this->data = $values['data'];
        $this->submitterEmail = $values['submitterEmail'] ?? null;
        if (array_key_exists('submitterEmail', $values)) {
            $this->_setField('submitterEmail');
        }
        $this->files = $values['files'];
        $this->spamReason = $values['spamReason'] ?? null;
        if (array_key_exists('spamReason', $values)) {
            $this->_setField('spamReason');
        }
        $this->risk = $values['risk'] ?? null;
        if (array_key_exists('risk', $values)) {
            $this->_setField('risk');
        }
        $this->ip = $values['ip'] ?? null;
        if (array_key_exists('ip', $values)) {
            $this->_setField('ip');
        }
        $this->userAgent = $values['userAgent'] ?? null;
        if (array_key_exists('userAgent', $values)) {
            $this->_setField('userAgent');
        }
        $this->origin = $values['origin'] ?? null;
        if (array_key_exists('origin', $values)) {
            $this->_setField('origin');
        }
        $this->referrer = $values['referrer'] ?? null;
        if (array_key_exists('referrer', $values)) {
            $this->_setField('referrer');
        }
        $this->confirmedAt = $values['confirmedAt'] ?? null;
        if (array_key_exists('confirmedAt', $values)) {
            $this->_setField('confirmedAt');
        }
        $this->acceptedAt = $values['acceptedAt'] ?? null;
        if (array_key_exists('acceptedAt', $values)) {
            $this->_setField('acceptedAt');
        }
        $this->releasedAt = $values['releasedAt'] ?? null;
        if (array_key_exists('releasedAt', $values)) {
            $this->_setField('releasedAt');
        }
        $this->sandbox = $values['sandbox'];
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
