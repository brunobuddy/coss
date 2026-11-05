<?php

namespace Coss\Forms\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\FormFieldInput;
use Coss\Core\Types\ArrayType;
use Coss\Forms\Types\CreateFormRequestSpam;
use Coss\Forms\Types\CreateFormRequestSubmitter;
use Coss\Forms\Types\CreateFormRequestNotifications;
use Coss\Forms\Types\CreateFormRequestContacts;
use Coss\Forms\Types\CreateFormRequestFiles;
use Coss\Forms\Types\CreateFormRequestHosted;

class CreateFormRequest extends JsonSerializableType
{
    /**
     * @var string $name Your name for the form, shown in the dashboard and in notifications.
     */
    #[JsonProperty('name')]
    public string $name;

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
     * @var ?CreateFormRequestSpam $spam How submissions are screened. Only the fields given change.
     */
    #[JsonProperty('spam')]
    public ?CreateFormRequestSpam $spam;

    /**
     * @var ?CreateFormRequestSubmitter $submitter Who the submitter is, and whether they must confirm by email. Only the fields given change.
     */
    #[JsonProperty('submitter')]
    public ?CreateFormRequestSubmitter $submitter;

    /**
     * @var ?CreateFormRequestNotifications $notifications Emails about accepted submissions. Only the fields given change.
     */
    #[JsonProperty('notifications')]
    public ?CreateFormRequestNotifications $notifications;

    /**
     * @var ?CreateFormRequestContacts $contacts Turning submissions into contacts. Only the fields given change.
     */
    #[JsonProperty('contacts')]
    public ?CreateFormRequestContacts $contacts;

    /**
     * @var ?CreateFormRequestFiles $files File uploads. Only the fields given change.
     */
    #[JsonProperty('files')]
    public ?CreateFormRequestFiles $files;

    /**
     * @var ?CreateFormRequestHosted $hosted The page coss.com can serve for this form. Only the fields given change.
     */
    #[JsonProperty('hosted')]
    public ?CreateFormRequestHosted $hosted;

    /**
     * @param array{
     *   name: string,
     *   enabled?: ?bool,
     *   fields?: ?array<FormFieldInput>,
     *   strictFields?: ?bool,
     *   allowedOrigins?: ?array<string>,
     *   redirectUrl?: ?string,
     *   spam?: ?CreateFormRequestSpam,
     *   submitter?: ?CreateFormRequestSubmitter,
     *   notifications?: ?CreateFormRequestNotifications,
     *   contacts?: ?CreateFormRequestContacts,
     *   files?: ?CreateFormRequestFiles,
     *   hosted?: ?CreateFormRequestHosted,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
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
