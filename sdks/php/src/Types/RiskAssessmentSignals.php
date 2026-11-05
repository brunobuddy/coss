<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * What the assessment saw, by group. A group is `null` when it had nothing to go on.
 */
class RiskAssessmentSignals extends JsonSerializableType
{
    /**
     * @var ?RiskEmailSignals $email What the address says. `null`: no email was given.
     */
    #[JsonProperty('email')]
    public ?RiskEmailSignals $email;

    /**
     * @var ?RiskIpSignals $ip What the IP address says. `null`: none was given.
     */
    #[JsonProperty('ip')]
    public ?RiskIpSignals $ip;

    /**
     * @var ?array<string, int> $velocity `null` when velocity was unavailable (see `degraded`).
     */
    #[JsonProperty('velocity'), ArrayType(['string' => 'integer'])]
    public ?array $velocity;

    /**
     * @var ?RiskCaptchaSignals $captcha How the captcha went. `null`: no captcha applied.
     */
    #[JsonProperty('captcha')]
    public ?RiskCaptchaSignals $captcha;

    /**
     * @var ?RiskLoginSignals $login Whether a login is new for this user. `null`: not a login of a user with history.
     */
    #[JsonProperty('login')]
    public ?RiskLoginSignals $login;

    /**
     * @var ?RiskContentSignals $content `null` when no content was given or it couldn't be classified.
     */
    #[JsonProperty('content')]
    public ?RiskContentSignals $content;

    /**
     * @var ?RiskCheckoutSignals $checkout What you sent in `checkout`. `null`: not given.
     */
    #[JsonProperty('checkout')]
    public ?RiskCheckoutSignals $checkout;

    /**
     * @var ?RiskDeviceSignals $device What the device token said. `null`: none was given.
     */
    #[JsonProperty('device')]
    public ?RiskDeviceSignals $device;

    /**
     * @param array{
     *   email?: ?RiskEmailSignals,
     *   ip?: ?RiskIpSignals,
     *   velocity?: ?array<string, int>,
     *   captcha?: ?RiskCaptchaSignals,
     *   login?: ?RiskLoginSignals,
     *   content?: ?RiskContentSignals,
     *   checkout?: ?RiskCheckoutSignals,
     *   device?: ?RiskDeviceSignals,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->email = $values['email'] ?? null;
        if (array_key_exists('email', $values)) {
            $this->_setField('email');
        }
        $this->ip = $values['ip'] ?? null;
        if (array_key_exists('ip', $values)) {
            $this->_setField('ip');
        }
        $this->velocity = $values['velocity'] ?? null;
        if (array_key_exists('velocity', $values)) {
            $this->_setField('velocity');
        }
        $this->captcha = $values['captcha'] ?? null;
        if (array_key_exists('captcha', $values)) {
            $this->_setField('captcha');
        }
        $this->login = $values['login'] ?? null;
        if (array_key_exists('login', $values)) {
            $this->_setField('login');
        }
        $this->content = $values['content'] ?? null;
        if (array_key_exists('content', $values)) {
            $this->_setField('content');
        }
        $this->checkout = $values['checkout'] ?? null;
        if (array_key_exists('checkout', $values)) {
            $this->_setField('checkout');
        }
        $this->device = $values['device'] ?? null;
        if (array_key_exists('device', $values)) {
            $this->_setField('device');
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
