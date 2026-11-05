<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Form extends JsonSerializableType
{
    /**
     * @var value-of<FormObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name Your name for the form, shown in the dashboard and in notifications.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var bool $enabled `false`: submissions are refused.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var string $endpoint Where the form posts: `<form action=…>`.
     */
    #[JsonProperty('endpoint')]
    public string $endpoint;

    /**
     * @var ?string $hostedUrl The hosted page, when `hosted.enabled`; `null` otherwise.
     */
    #[JsonProperty('hosted_url')]
    public ?string $hostedUrl;

    /**
     * @var ?array<FormField> $fields The form's fields. `null`: any field is accepted, without validation.
     */
    #[JsonProperty('fields'), ArrayType([FormField::class])]
    public ?array $fields;

    /**
     * @var bool $strictFields With `fields`: whether fields the form doesn't define are refused.
     */
    #[JsonProperty('strict_fields')]
    public bool $strictFields;

    /**
     * @var array<string> $allowedOrigins Sites that may post to the form. Empty: any.
     */
    #[JsonProperty('allowed_origins'), ArrayType(['string'])]
    public array $allowedOrigins;

    /**
     * @var ?string $redirectUrl Where browsers go after an HTML post. `null`: coss.com's thank-you page.
     */
    #[JsonProperty('redirect_url')]
    public ?string $redirectUrl;

    /**
     * @var FormSpam $spam How submissions are screened.
     */
    #[JsonProperty('spam')]
    public FormSpam $spam;

    /**
     * @var FormSubmitter $submitter Who the submitter is, and whether they must confirm by email.
     */
    #[JsonProperty('submitter')]
    public FormSubmitter $submitter;

    /**
     * @var FormNotifications $notifications Emails about accepted submissions.
     */
    #[JsonProperty('notifications')]
    public FormNotifications $notifications;

    /**
     * @var FormContacts $contacts Turning submissions into contacts.
     */
    #[JsonProperty('contacts')]
    public FormContacts $contacts;

    /**
     * @var FormFiles $files File uploads.
     */
    #[JsonProperty('files')]
    public FormFiles $files;

    /**
     * @var FormHosted $hosted The page coss.com can serve for this form.
     */
    #[JsonProperty('hosted')]
    public FormHosted $hosted;

    /**
     * @var bool $disabledByAdmin coss.com disabled the form for abuse; contact support.
     */
    #[JsonProperty('disabled_by_admin')]
    public bool $disabledByAdmin;

    /**
     * @var bool $sandbox Whether the form belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<FormObject>,
     *   id: string,
     *   name: string,
     *   enabled: bool,
     *   endpoint: string,
     *   strictFields: bool,
     *   allowedOrigins: array<string>,
     *   spam: FormSpam,
     *   submitter: FormSubmitter,
     *   notifications: FormNotifications,
     *   contacts: FormContacts,
     *   files: FormFiles,
     *   hosted: FormHosted,
     *   disabledByAdmin: bool,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   hostedUrl?: ?string,
     *   fields?: ?array<FormField>,
     *   redirectUrl?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->enabled = $values['enabled'];
        $this->endpoint = $values['endpoint'];
        $this->hostedUrl = $values['hostedUrl'] ?? null;
        if (array_key_exists('hostedUrl', $values)) {
            $this->_setField('hostedUrl');
        }
        $this->fields = $values['fields'] ?? null;
        if (array_key_exists('fields', $values)) {
            $this->_setField('fields');
        }
        $this->strictFields = $values['strictFields'];
        $this->allowedOrigins = $values['allowedOrigins'];
        $this->redirectUrl = $values['redirectUrl'] ?? null;
        if (array_key_exists('redirectUrl', $values)) {
            $this->_setField('redirectUrl');
        }
        $this->spam = $values['spam'];
        $this->submitter = $values['submitter'];
        $this->notifications = $values['notifications'];
        $this->contacts = $values['contacts'];
        $this->files = $values['files'];
        $this->hosted = $values['hosted'];
        $this->disabledByAdmin = $values['disabledByAdmin'];
        $this->sandbox = $values['sandbox'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
