<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RiskSettingsCaptcha extends JsonSerializableType
{
    /**
     * @var value-of<RiskSettingsCaptchaProvider> $provider The captcha provider.
     */
    #[JsonProperty('provider')]
    public string $provider;

    /**
     * @var bool $required Whether assessments without a token get `captcha.missing`.
     */
    #[JsonProperty('required')]
    public bool $required;

    /**
     * @param array{
     *   provider: value-of<RiskSettingsCaptchaProvider>,
     *   required: bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->provider = $values['provider'];
        $this->required = $values['required'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
