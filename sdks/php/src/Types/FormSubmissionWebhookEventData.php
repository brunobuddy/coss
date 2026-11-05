<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use DateTime;
use Coss\Core\Types\Date;

/**
 * The submission.
 */
class FormSubmissionWebhookEventData extends JsonSerializableType
{
    /**
     * @var string $formId The form's id.
     */
    #[JsonProperty('form_id')]
    public string $formId;

    /**
     * @var string $formName The form's name.
     */
    #[JsonProperty('form_name')]
    public string $formName;

    /**
     * @var string $submissionId The submission's id.
     */
    #[JsonProperty('submission_id')]
    public string $submissionId;

    /**
     * @var value-of<FormSubmissionWebhookEventDataStatus> $status The submission's status after this event.
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
     * @var array<FormSubmissionFile> $files Uploaded files (download them with the API; never their bytes here).
     */
    #[JsonProperty('files'), ArrayType([FormSubmissionFile::class])]
    public array $files;

    /**
     * @var ?value-of<FormSubmissionWebhookEventDataSpamReason> $spamReason Why it was flagged. `null`: not flagged.
     */
    #[JsonProperty('spam_reason')]
    public ?string $spamReason;

    /**
     * @var bool $sandbox Whether it belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $occurredAt When this happened.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @param array{
     *   formId: string,
     *   formName: string,
     *   submissionId: string,
     *   status: value-of<FormSubmissionWebhookEventDataStatus>,
     *   data: array<string, (
     *    string
     *   |array<string>
     * )>,
     *   files: array<FormSubmissionFile>,
     *   sandbox: bool,
     *   occurredAt: DateTime,
     *   submitterEmail?: ?string,
     *   spamReason?: ?value-of<FormSubmissionWebhookEventDataSpamReason>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->formId = $values['formId'];
        $this->formName = $values['formName'];
        $this->submissionId = $values['submissionId'];
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
        $this->sandbox = $values['sandbox'];
        $this->occurredAt = $values['occurredAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
