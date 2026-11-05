<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SchedulingReminder extends JsonSerializableType
{
    /**
     * @var string $key What webhooks and the booking call this reminder.
     */
    #[JsonProperty('key')]
    public string $key;

    /**
     * @var value-of<SchedulingReminderAnchor> $anchor The moment this is timed from.
     */
    #[JsonProperty('anchor')]
    public string $anchor;

    /**
     * @var ?float $beforeMinutes How long before the anchor. `null` when it's after.
     */
    #[JsonProperty('before_minutes')]
    public ?float $beforeMinutes;

    /**
     * @var ?float $afterMinutes How long after the anchor. `null` when it's before.
     */
    #[JsonProperty('after_minutes')]
    public ?float $afterMinutes;

    /**
     * @var array<value-of<SchedulingReminderSendItem>> $send Who hears about it. `webhook` fires `scheduling.booking.reminder`.
     */
    #[JsonProperty('send'), ArrayType(['string'])]
    public array $send;

    /**
     * @var array<string> $emailTo Fixed addresses that are emailed as well.
     */
    #[JsonProperty('email_to'), ArrayType(['string'])]
    public array $emailTo;

    /**
     * @var ?string $subject Your own subject. `null`: the standard one.
     */
    #[JsonProperty('subject')]
    public ?string $subject;

    /**
     * @var ?string $message Your own words in the email. `null`: the standard ones.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var ?string $smsMessage Your own text. `null`: the standard one.
     */
    #[JsonProperty('sms_message')]
    public ?string $smsMessage;

    /**
     * @var ?SchedulingReminderButton $button One button in the email. `null`: none.
     */
    #[JsonProperty('button')]
    public ?SchedulingReminderButton $button;

    /**
     * @var bool $includeInvite Whether the emails carry the invitation.
     */
    #[JsonProperty('include_invite')]
    public bool $includeInvite;

    /**
     * @var bool $sendIfLate Whether it goes right away if booked after its moment, instead of being skipped.
     */
    #[JsonProperty('send_if_late')]
    public bool $sendIfLate;

    /**
     * @var bool $skipNoShow Whether it's dropped once the booking is marked a no-show.
     */
    #[JsonProperty('skip_no_show')]
    public bool $skipNoShow;

    /**
     * @var ?SchedulingReminderOnlyIf $onlyIf Only for bookings matching all of this. `null`: every booking.
     */
    #[JsonProperty('only_if')]
    public ?SchedulingReminderOnlyIf $onlyIf;

    /**
     * @param array{
     *   key: string,
     *   anchor: value-of<SchedulingReminderAnchor>,
     *   send: array<value-of<SchedulingReminderSendItem>>,
     *   emailTo: array<string>,
     *   includeInvite: bool,
     *   sendIfLate: bool,
     *   skipNoShow: bool,
     *   beforeMinutes?: ?float,
     *   afterMinutes?: ?float,
     *   subject?: ?string,
     *   message?: ?string,
     *   smsMessage?: ?string,
     *   button?: ?SchedulingReminderButton,
     *   onlyIf?: ?SchedulingReminderOnlyIf,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->key = $values['key'];
        $this->anchor = $values['anchor'];
        $this->beforeMinutes = $values['beforeMinutes'] ?? null;
        if (array_key_exists('beforeMinutes', $values)) {
            $this->_setField('beforeMinutes');
        }
        $this->afterMinutes = $values['afterMinutes'] ?? null;
        if (array_key_exists('afterMinutes', $values)) {
            $this->_setField('afterMinutes');
        }
        $this->send = $values['send'];
        $this->emailTo = $values['emailTo'];
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
        $this->includeInvite = $values['includeInvite'];
        $this->sendIfLate = $values['sendIfLate'];
        $this->skipNoShow = $values['skipNoShow'];
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
