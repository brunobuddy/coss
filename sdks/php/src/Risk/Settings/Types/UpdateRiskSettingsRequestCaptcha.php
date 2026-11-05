<?php

namespace Coss\Risk\Settings\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateRiskSettingsRequestCaptcha extends JsonSerializableType
{
    /**
     * @var value-of<UpdateRiskSettingsRequestCaptchaProvider> $provider The captcha provider.
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var ?string $secret The provider's secret key. Required when setting a provider for the first time or changing it; stored encrypted and never returned.
     */
    #[JsonProperty('secret')]
    public ?string $secret;

    /**
     * @var ?bool $required Assessments without a `captcha` token get `captcha.missing`. Default false.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @param array{
     *   provider: value-of<UpdateRiskSettingsRequestCaptchaProvider>,
     *   secret?: ?string,
     *   required?: ?bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->provider = $values['provider'];
        $this->secret = $values['secret'] ?? null;
        if (array_key_exists('secret', $values)) {
            $this->_setField('secret');
        }
        $this->required = $values['required'] ?? null;
        if (array_key_exists('required', $values)) {
            $this->_setField('required');
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
