<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Details of the event: only what its `type` has.
 */
class EmailEventData extends JsonSerializableType
{
    /**
     * @var ?EmailEventDataBounce $bounce
     */
    #[JsonProperty('bounce')]
    public ?EmailEventDataBounce $bounce;

    /**
     * @var ?EmailEventDataComplaint $complaint
     */
    #[JsonProperty('complaint')]
    public ?EmailEventDataComplaint $complaint;

    /**
     * @var ?EmailEventDataDelay $delay
     */
    #[JsonProperty('delay')]
    public ?EmailEventDataDelay $delay;

    /**
     * @var ?EmailEventDataDelivery $delivery
     */
    #[JsonProperty('delivery')]
    public ?EmailEventDataDelivery $delivery;

    /**
     * @var ?EmailEventDataFailure $failure
     */
    #[JsonProperty('failure')]
    public ?EmailEventDataFailure $failure;

    /**
     * @var ?EmailEventDataSuppression $suppression Only for `email.suppressed`: the entry that matched the recipient.
     */
    #[JsonProperty('suppression')]
    public ?EmailEventDataSuppression $suppression;

    /**
     * @var ?EmailEventDataUnsubscribe $unsubscribe Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
     */
    #[JsonProperty('unsubscribe')]
    public ?EmailEventDataUnsubscribe $unsubscribe;

    /**
     * @var ?EmailEventDataOpen $open Only for `email.opened`.
     */
    #[JsonProperty('open')]
    public ?EmailEventDataOpen $open;

    /**
     * @var ?EmailEventDataClick $click Only for `email.clicked`.
     */
    #[JsonProperty('click')]
    public ?EmailEventDataClick $click;

    /**
     * @var ?EmailEventDataReschedule $reschedule Only for `email.rescheduled`.
     */
    #[JsonProperty('reschedule')]
    public ?EmailEventDataReschedule $reschedule;

    /**
     * @param array{
     *   bounce?: ?EmailEventDataBounce,
     *   complaint?: ?EmailEventDataComplaint,
     *   delay?: ?EmailEventDataDelay,
     *   delivery?: ?EmailEventDataDelivery,
     *   failure?: ?EmailEventDataFailure,
     *   suppression?: ?EmailEventDataSuppression,
     *   unsubscribe?: ?EmailEventDataUnsubscribe,
     *   open?: ?EmailEventDataOpen,
     *   click?: ?EmailEventDataClick,
     *   reschedule?: ?EmailEventDataReschedule,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->bounce = $values['bounce'] ?? null;
        if (array_key_exists('bounce', $values)) {
            $this->_setField('bounce');
        }
        $this->complaint = $values['complaint'] ?? null;
        if (array_key_exists('complaint', $values)) {
            $this->_setField('complaint');
        }
        $this->delay = $values['delay'] ?? null;
        if (array_key_exists('delay', $values)) {
            $this->_setField('delay');
        }
        $this->delivery = $values['delivery'] ?? null;
        if (array_key_exists('delivery', $values)) {
            $this->_setField('delivery');
        }
        $this->failure = $values['failure'] ?? null;
        if (array_key_exists('failure', $values)) {
            $this->_setField('failure');
        }
        $this->suppression = $values['suppression'] ?? null;
        if (array_key_exists('suppression', $values)) {
            $this->_setField('suppression');
        }
        $this->unsubscribe = $values['unsubscribe'] ?? null;
        if (array_key_exists('unsubscribe', $values)) {
            $this->_setField('unsubscribe');
        }
        $this->open = $values['open'] ?? null;
        if (array_key_exists('open', $values)) {
            $this->_setField('open');
        }
        $this->click = $values['click'] ?? null;
        if (array_key_exists('click', $values)) {
            $this->_setField('click');
        }
        $this->reschedule = $values['reschedule'] ?? null;
        if (array_key_exists('reschedule', $values)) {
            $this->_setField('reschedule');
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
