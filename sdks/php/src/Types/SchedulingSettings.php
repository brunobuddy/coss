<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;

class SchedulingSettings extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSettingsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var array<string> $allowedOrigins Sites allowed to embed coss.com's hosted pages and call the client API.
     */
    #[JsonProperty('allowed_origins'), ArrayType(['string'])]
    public array $allowedOrigins;

    /**
     * @var ?string $brandName Your name on hosted pages and on emails sent from `email_from`. `null`: none set.
     */
    #[JsonProperty('brand_name')]
    public ?string $brandName;

    /**
     * @var ?string $accentColor The accent color of hosted pages and emails sent from `email_from`, as `#RRGGBB`. `null`: the default.
     */
    #[JsonProperty('accent_color')]
    public ?string $accentColor;

    /**
     * @var ?SchedulingSettingsLogo $logo At the top of the hosted pages, and of emails sent from `email_from`.
     */
    #[JsonProperty('logo')]
    public ?SchedulingSettingsLogo $logo;

    /**
     * @var ?string $emailFrom Sender of booking emails, on a verified domain.
     */
    #[JsonProperty('email_from')]
    public ?string $emailFrom;

    /**
     * @var ?string $smsFrom Your approved number for SMS reminders. Without one, no SMS is sent.
     */
    #[JsonProperty('sms_from')]
    public ?string $smsFrom;

    /**
     * @var value-of<SchedulingSettingsCalendarFailureMode> $calendarFailureMode When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
     */
    #[JsonProperty('calendar_failure_mode')]
    public string $calendarFailureMode;

    /**
     * @var ?array<string, ?SchedulingSettingsNotificationsValue> $notifications Per event, overriding the defaults.
     */
    #[JsonProperty('notifications'), ArrayType(['string' => new Union(SchedulingSettingsNotificationsValue::class, 'null')])]
    public ?array $notifications;

    /**
     * @var ?string $emailReplyTo
     */
    #[JsonProperty('email_reply_to')]
    public ?string $emailReplyTo;

    /**
     * @var ?array<SchedulingReminder> $reminders What goes out around a booking, unless an event type has its own. `null`: a reminder a day before, on the channels `notifications.reminder` chooses.
     */
    #[JsonProperty('reminders'), ArrayType([SchedulingReminder::class])]
    public ?array $reminders;

    /**
     * @param array{
     *   object: value-of<SchedulingSettingsObject>,
     *   allowedOrigins: array<string>,
     *   calendarFailureMode: value-of<SchedulingSettingsCalendarFailureMode>,
     *   brandName?: ?string,
     *   accentColor?: ?string,
     *   logo?: ?SchedulingSettingsLogo,
     *   emailFrom?: ?string,
     *   smsFrom?: ?string,
     *   notifications?: ?array<string, ?SchedulingSettingsNotificationsValue>,
     *   emailReplyTo?: ?string,
     *   reminders?: ?array<SchedulingReminder>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->allowedOrigins = $values['allowedOrigins'];
        $this->brandName = $values['brandName'] ?? null;
        if (array_key_exists('brandName', $values)) {
            $this->_setField('brandName');
        }
        $this->accentColor = $values['accentColor'] ?? null;
        if (array_key_exists('accentColor', $values)) {
            $this->_setField('accentColor');
        }
        $this->logo = $values['logo'] ?? null;
        if (array_key_exists('logo', $values)) {
            $this->_setField('logo');
        }
        $this->emailFrom = $values['emailFrom'] ?? null;
        if (array_key_exists('emailFrom', $values)) {
            $this->_setField('emailFrom');
        }
        $this->smsFrom = $values['smsFrom'] ?? null;
        if (array_key_exists('smsFrom', $values)) {
            $this->_setField('smsFrom');
        }
        $this->calendarFailureMode = $values['calendarFailureMode'];
        $this->notifications = $values['notifications'] ?? null;
        if (array_key_exists('notifications', $values)) {
            $this->_setField('notifications');
        }
        $this->emailReplyTo = $values['emailReplyTo'] ?? null;
        if (array_key_exists('emailReplyTo', $values)) {
            $this->_setField('emailReplyTo');
        }
        $this->reminders = $values['reminders'] ?? null;
        if (array_key_exists('reminders', $values)) {
            $this->_setField('reminders');
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
