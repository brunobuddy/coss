<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * What the browser reported through `coss/device` (its device id is only kept as a keyed hash).
 */
class RiskDeviceSignals extends JsonSerializableType
{
    /**
     * @var bool $valid `false`: the token was malformed or too old.
     */
    #[JsonProperty('valid')]
    public bool $valid;

    /**
     * @var bool $automation WebDriver control or a headless browser.
     */
    #[JsonProperty('automation')]
    public bool $automation;

    /**
     * @var ?string $timezone IANA time zone (`Europe/London`).
     */
    #[JsonProperty('timezone')]
    public ?string $timezone;

    /**
     * @var ?string $language The browser's first language.
     */
    #[JsonProperty('language')]
    public ?string $language;

    /**
     * @var ?string $platform The browser's reported platform. `null` when it reported none.
     */
    #[JsonProperty('platform')]
    public ?string $platform;

    /**
     * @var ?string $screen `<width>x<height>` in CSS pixels.
     */
    #[JsonProperty('screen')]
    public ?string $screen;

    /**
     * @var ?bool $touch Whether the device has a touch screen. `null` when it didn't say.
     */
    #[JsonProperty('touch')]
    public ?bool $touch;

    /**
     * @param array{
     *   valid: bool,
     *   automation: bool,
     *   timezone?: ?string,
     *   language?: ?string,
     *   platform?: ?string,
     *   screen?: ?string,
     *   touch?: ?bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->valid = $values['valid'];
        $this->automation = $values['automation'];
        $this->timezone = $values['timezone'] ?? null;
        if (array_key_exists('timezone', $values)) {
            $this->_setField('timezone');
        }
        $this->language = $values['language'] ?? null;
        if (array_key_exists('language', $values)) {
            $this->_setField('language');
        }
        $this->platform = $values['platform'] ?? null;
        if (array_key_exists('platform', $values)) {
            $this->_setField('platform');
        }
        $this->screen = $values['screen'] ?? null;
        if (array_key_exists('screen', $values)) {
            $this->_setField('screen');
        }
        $this->touch = $values['touch'] ?? null;
        if (array_key_exists('touch', $values)) {
            $this->_setField('touch');
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
