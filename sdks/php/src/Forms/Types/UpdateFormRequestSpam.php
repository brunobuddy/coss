<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * How submissions are screened. Only the fields given change.
 */
class UpdateFormRequestSpam extends JsonSerializableType
{
    /**
     * @var ?string $honeypotField A field people leave empty (hide it with CSS); a submission that fills it is spam. Default `_gotcha`.
     */
    #[JsonProperty('honeypot_field')]
    public ?string $honeypotField;

    /**
     * @var ?value-of<UpdateFormRequestSpamCaptcha> $captcha `required`: submissions need a token from the captcha set in the environment's risk settings (Turnstile or hCaptcha). Default `off`.
     */
    #[JsonProperty('captcha')]
    public ?string $captcha;

    /**
     * @var ?string $captchaSiteKey The captcha's site key, which hosted pages render the widget with.
     */
    #[JsonProperty('captcha_site_key')]
    public ?string $captchaSiteKey;

    /**
     * @var ?float $contentThreshold A submission whose text scores at least this in a content category (spam, phishing, malware, fraud) is spam. Default 0.9; `null` leaves content to the environment's risk settings.
     */
    #[JsonProperty('content_threshold')]
    public ?float $contentThreshold;

    /**
     * @var ?value-of<UpdateFormRequestSpamOnReview> $onReview What happens when Risk's decision is `review`: `hold` (default) keeps the submission until you release it, `deliver` delivers it.
     */
    #[JsonProperty('on_review')]
    public ?string $onReview;

    /**
     * @param array{
     *   honeypotField?: ?string,
     *   captcha?: ?value-of<UpdateFormRequestSpamCaptcha>,
     *   captchaSiteKey?: ?string,
     *   contentThreshold?: ?float,
     *   onReview?: ?value-of<UpdateFormRequestSpamOnReview>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->honeypotField = $values['honeypotField'] ?? null;
        if (array_key_exists('honeypotField', $values)) {
            $this->_setField('honeypotField');
        }
        $this->captcha = $values['captcha'] ?? null;
        if (array_key_exists('captcha', $values)) {
            $this->_setField('captcha');
        }
        $this->captchaSiteKey = $values['captchaSiteKey'] ?? null;
        if (array_key_exists('captchaSiteKey', $values)) {
            $this->_setField('captchaSiteKey');
        }
        $this->contentThreshold = $values['contentThreshold'] ?? null;
        if (array_key_exists('contentThreshold', $values)) {
            $this->_setField('contentThreshold');
        }
        $this->onReview = $values['onReview'] ?? null;
        if (array_key_exists('onReview', $values)) {
            $this->_setField('onReview');
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
