<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingReminderInput extends JsonSerializableType
{
    /**
     * @var ?string $key Names this reminder in webhooks and on the booking. Default: from its timing, like `start-1440`.
     */
    #[JsonProperty('key')]
    public ?string $key;

    /**
     * @var value-of<SchedulingReminderInputAnchor> $anchor The moment this is timed from.
     */
    #[JsonProperty('anchor')]
    public string $anchor;

    /**
     * @var ?int $beforeMinutes How long before the anchor. Only for `start` and `end`.
     */
    #[JsonProperty('before_minutes')]
    public ?int $beforeMinutes;

    /**
     * @var ?int $afterMinutes How long after the anchor, up to 60 days. Default for other anchors: 0.
     */
    #[JsonProperty('after_minutes')]
    public ?int $afterMinutes;

    /**
     * @var ?array<value-of<SchedulingReminderInputSendItem>> $send Who hears about it. `webhook` fires `scheduling.booking.reminder`.
     */
    #[JsonProperty('send'), ArrayType(['string'])]
    public ?array $send;

    /**
     * @var ?array<string> $emailTo Fixed addresses to email as well: verified members of your organization, or addresses on your verified domains (live environments).
     */
    #[JsonProperty('email_to'), ArrayType(['string'])]
    public ?array $emailTo;

    /**
     * @var ?string $subject Your own subject, with `{{variables}}`. Needs `email_from`.
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $message Your own words in place of the standard first line, with `{{variables}}` and no links. The booking's details stay below it. Needs `email_from`.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var ?string $smsMessage Your own text, with `{{variables}}` other than names, and no links. `Reply STOP to opt out.` is always added.
     */
    #[JsonProperty('sms_message')]
    public ?string $smsMessage;

    /**
     * @var ?SchedulingReminderInputButton $button One button in the email. Needs `email_from`.
     */
    #[JsonProperty('button')]
    public ?SchedulingReminderInputButton $button;

    /**
     * @var ?bool $includeInvite Attach the calendar invitation to the emails.
     */
    #[JsonProperty('include_invite')]
    public ?bool $includeInvite;

    /**
     * @var ?bool $sendIfLate If it was booked after this reminder's moment, send it right away instead of skipping it, as long as the meeting is still ahead. Only for `before_minutes` on `start`.
     */
    #[JsonProperty('send_if_late')]
    public ?bool $sendIfLate;

    /**
     * @var ?bool $skipNoShow Don't send it once the booking is marked a no-show. Default: true on `end`.
     */
    #[JsonProperty('skip_no_show')]
    public ?bool $skipNoShow;

    /**
     * @var ?SchedulingReminderInputOnlyIf $onlyIf Only for bookings matching all of this, checked when it's due.
     */
    #[JsonProperty('only_if')]
    public ?SchedulingReminderInputOnlyIf $onlyIf;

    /**
     * @param array{
     *   anchor: value-of<SchedulingReminderInputAnchor>,
     *   key?: ?string,
     *   beforeMinutes?: ?int,
     *   afterMinutes?: ?int,
     *   send?: ?array<value-of<SchedulingReminderInputSendItem>>,
     *   emailTo?: ?array<string>,
     *   subject?: ?string,
     *   message?: ?string,
     *   smsMessage?: ?string,
     *   button?: ?SchedulingReminderInputButton,
     *   includeInvite?: ?bool,
     *   sendIfLate?: ?bool,
     *   skipNoShow?: ?bool,
     *   onlyIf?: ?SchedulingReminderInputOnlyIf,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'] ?? null;
        if (array_key_exists('key', $values)) {
            $this->_setField('key');
        }
        $this->anchor = $values['anchor'];
        $this->beforeMinutes = $values['beforeMinutes'] ?? null;
        if (array_key_exists('beforeMinutes', $values)) {
            $this->_setField('beforeMinutes');
        }
        $this->afterMinutes = $values['afterMinutes'] ?? null;
        if (array_key_exists('afterMinutes', $values)) {
            $this->_setField('afterMinutes');
        }
        $this->send = $values['send'] ?? null;
        if (array_key_exists('send', $values)) {
            $this->_setField('send');
        }
        $this->emailTo = $values['emailTo'] ?? null;
        if (array_key_exists('emailTo', $values)) {
            $this->_setField('emailTo');
        }
        $this->subject = $values['subject'] ?? null;
        if (array_key_exists('subject', $values)) {
            $this->_setField('subject');
        }
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->smsMessage = $values['smsMessage'] ?? null;
        if (array_key_exists('smsMessage', $values)) {
            $this->_setField('smsMessage');
        }
        $this->button = $values['button'] ?? null;
        if (array_key_exists('button', $values)) {
            $this->_setField('button');
        }
        $this->includeInvite = $values['includeInvite'] ?? null;
        if (array_key_exists('includeInvite', $values)) {
            $this->_setField('includeInvite');
        }
        $this->sendIfLate = $values['sendIfLate'] ?? null;
        if (array_key_exists('sendIfLate', $values)) {
            $this->_setField('sendIfLate');
        }
        $this->skipNoShow = $values['skipNoShow'] ?? null;
        if (array_key_exists('skipNoShow', $values)) {
            $this->_setField('skipNoShow');
        }
        $this->onlyIf = $values['onlyIf'] ?? null;
        if (array_key_exists('onlyIf', $values)) {
            $this->_setField('onlyIf');
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
