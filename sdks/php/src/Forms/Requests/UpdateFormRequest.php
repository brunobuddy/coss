<?php

namespace Coss\Forms\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\FormFieldInput;
use Coss\Core\Types\ArrayType;
use Coss\Forms\Types\UpdateFormRequestSpam;
use Coss\Forms\Types\UpdateFormRequestSubmitter;
use Coss\Forms\Types\UpdateFormRequestNotifications;
use Coss\Forms\Types\UpdateFormRequestContacts;
use Coss\Forms\Types\UpdateFormRequestFiles;
use Coss\Forms\Types\UpdateFormRequestHosted;

class UpdateFormRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Your name for the form, shown in the dashboard and in notifications.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?bool $enabled `false`: submissions are refused.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @var ?array<FormFieldInput> $fields The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
     */
    #[JsonProperty('fields'), ArrayType([FormFieldInput::class])]
    public ?array $fields;

    /**
     * @var ?bool $strictFields With `fields`: refuse fields the form doesn't define. Default false.
     */
    #[JsonProperty('strict_fields')]
    public ?bool $strictFields;

    /**
     * @var ?array<string> $allowedOrigins Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.
     */
    #[JsonProperty('allowed_origins'), ArrayType(['string'])]
    public ?array $allowedOrigins;

    /**
     * @var ?string $redirectUrl Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
     */
    #[JsonProperty('redirect_url')]
    public ?string $redirectUrl;

    /**
     * @var ?UpdateFormRequestSpam $spam How submissions are screened. Only the fields given change.
     */
    #[JsonProperty('spam')]
    public ?UpdateFormRequestSpam $spam;

    /**
     * @var ?UpdateFormRequestSubmitter $submitter Who the submitter is, and whether they must confirm by email. Only the fields given change.
     */
    #[JsonProperty('submitter')]
    public ?UpdateFormRequestSubmitter $submitter;

    /**
     * @var ?UpdateFormRequestNotifications $notifications Emails about accepted submissions. Only the fields given change.
     */
    #[JsonProperty('notifications')]
    public ?UpdateFormRequestNotifications $notifications;

    /**
     * @var ?UpdateFormRequestContacts $contacts Turning submissions into contacts. Only the fields given change.
     */
    #[JsonProperty('contacts')]
    public ?UpdateFormRequestContacts $contacts;

    /**
     * @var ?UpdateFormRequestFiles $files File uploads. Only the fields given change.
     */
    #[JsonProperty('files')]
    public ?UpdateFormRequestFiles $files;

    /**
     * @var ?UpdateFormRequestHosted $hosted The page coss.com can serve for this form. Only the fields given change.
     */
    #[JsonProperty('hosted')]
    public ?UpdateFormRequestHosted $hosted;

    /**
     * @param array{
     *   name?: ?string,
     *   enabled?: ?bool,
     *   fields?: ?array<FormFieldInput>,
     *   strictFields?: ?bool,
     *   allowedOrigins?: ?array<string>,
     *   redirectUrl?: ?string,
     *   spam?: ?UpdateFormRequestSpam,
     *   submitter?: ?UpdateFormRequestSubmitter,
     *   notifications?: ?UpdateFormRequestNotifications,
     *   contacts?: ?UpdateFormRequestContacts,
     *   files?: ?UpdateFormRequestFiles,
     *   hosted?: ?UpdateFormRequestHosted,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
        }
        $this->fields = $values['fields'] ?? null;
        if (array_key_exists('fields', $values)) {
            $this->_setField('fields');
        }
        $this->strictFields = $values['strictFields'] ?? null;
        if (array_key_exists('strictFields', $values)) {
            $this->_setField('strictFields');
        }
        $this->allowedOrigins = $values['allowedOrigins'] ?? null;
        if (array_key_exists('allowedOrigins', $values)) {
            $this->_setField('allowedOrigins');
        }
        $this->redirectUrl = $values['redirectUrl'] ?? null;
        if (array_key_exists('redirectUrl', $values)) {
            $this->_setField('redirectUrl');
        }
        $this->spam = $values['spam'] ?? null;
        if (array_key_exists('spam', $values)) {
            $this->_setField('spam');
        }
        $this->submitter = $values['submitter'] ?? null;
        if (array_key_exists('submitter', $values)) {
            $this->_setField('submitter');
        }
        $this->notifications = $values['notifications'] ?? null;
        if (array_key_exists('notifications', $values)) {
            $this->_setField('notifications');
        }
        $this->contacts = $values['contacts'] ?? null;
        if (array_key_exists('contacts', $values)) {
            $this->_setField('contacts');
        }
        $this->files = $values['files'] ?? null;
        if (array_key_exists('files', $values)) {
            $this->_setField('files');
        }
        $this->hosted = $values['hosted'] ?? null;
        if (array_key_exists('hosted', $values)) {
            $this->_setField('hosted');
        }
    }
}
