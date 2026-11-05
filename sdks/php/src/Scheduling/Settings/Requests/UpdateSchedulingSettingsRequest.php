<?php

namespace Coss\Scheduling\Settings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Scheduling\Settings\Types\UpdateSchedulingSettingsRequestLogo;
use Coss\Scheduling\Settings\Types\UpdateSchedulingSettingsRequestCalendarFailureMode;
use Coss\Scheduling\Settings\Types\UpdateSchedulingSettingsRequestNotificationsValue;
use Coss\Core\Types\Union;
use Coss\Types\SchedulingReminderInput;

class UpdateSchedulingSettingsRequest extends JsonSerializableType
{
    /**
     * @var ?array<string> $allowedOrigins Sites allowed to embed coss.com's hosted pages and call the client API, as `https://host` origins.
     */
    #[JsonProperty('allowed_origins'), ArrayType(['string'])]
    public ?array $allowedOrigins;

    /**
     * @var ?string $brandName Your name on hosted pages and on emails sent from `email_from`. `null` removes it.
     */
    #[JsonProperty('brand_name')]
    public ?string $brandName;

    /**
     * @var ?string $accentColor The accent color as `#RRGGBB`. `null` restores the default.
     */
    #[JsonProperty('accent_color')]
    public ?string $accentColor;

    /**
     * @var ?UpdateSchedulingSettingsRequestLogo $logo Your logo, a PNG or JPEG. `null` removes it.
     */
    #[JsonProperty('logo')]
    public ?UpdateSchedulingSettingsRequestLogo $logo;

    /**
     * @var ?string $emailFrom Sender of booking emails, on a verified domain. `null`: coss.com's own address.
     */
    #[JsonProperty('email_from')]
    public ?string $emailFrom;

    /**
     * @var ?string $smsFrom Your approved number for SMS reminders, in E.164. `null`: no SMS is sent.
     */
    #[JsonProperty('sms_from')]
    public ?string $smsFrom;

    /**
     * @var ?value-of<UpdateSchedulingSettingsRequestCalendarFailureMode> $calendarFailureMode When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
     */
    #[JsonProperty('calendar_failure_mode')]
    public ?string $calendarFailureMode;

    /**
     * @var ?array<string, ?UpdateSchedulingSettingsRequestNotificationsValue> $notifications Per event (`confirmed`, `pending_approval`, `rescheduled`, `cancelled`, `declined`, `reminder`), overriding the defaults. `null` restores them.
     */
    #[JsonProperty('notifications'), ArrayType(['string' => new Union(UpdateSchedulingSettingsRequestNotificationsValue::class, 'null')])]
    public ?array $notifications;

    /**
     * @var ?string $emailReplyTo Where replies go, for emails from `email_from`.
     */
    #[JsonProperty('email_reply_to')]
    public ?string $emailReplyTo;

    /**
     * @var ?array<SchedulingReminderInput> $reminders What goes out around a booking, unless an event type has its own. `null` goes back to a reminder a day before.
     */
    #[JsonProperty('reminders'), ArrayType([SchedulingReminderInput::class])]
    public ?array $reminders;

    /**
     * @param array{
     *   allowedOrigins?: ?array<string>,
     *   brandName?: ?string,
     *   accentColor?: ?string,
     *   logo?: ?UpdateSchedulingSettingsRequestLogo,
     *   emailFrom?: ?string,
     *   smsFrom?: ?string,
     *   calendarFailureMode?: ?value-of<UpdateSchedulingSettingsRequestCalendarFailureMode>,
     *   notifications?: ?array<string, ?UpdateSchedulingSettingsRequestNotificationsValue>,
     *   emailReplyTo?: ?string,
     *   reminders?: ?array<SchedulingReminderInput>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->allowedOrigins = $values['allowedOrigins'] ?? null;
        if (array_key_exists('allowedOrigins', $values)) {
            $this->_setField('allowedOrigins');
        }
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
        $this->calendarFailureMode = $values['calendarFailureMode'] ?? null;
        if (array_key_exists('calendarFailureMode', $values)) {
            $this->_setField('calendarFailureMode');
        }
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
}
