<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * How submissions are screened.
 */
class FormSpam extends JsonSerializableType
{
    /**
     * @var string $honeypotField A field people leave empty; a submission that fills it is spam.
     */
    #[JsonProperty('honeypot_field')]
    public string $honeypotField;

    /**
     * @var value-of<FormSpamCaptcha> $captcha `required`: submissions need a captcha token. `off`: they don't.
     */
    #[JsonProperty('captcha')]
    public string $captcha;

    /**
     * @var ?string $captchaSiteKey The captcha's site key, which hosted pages render the widget with. `null`: none set.
     */
    #[JsonProperty('captcha_site_key')]
    public ?string $captchaSiteKey;

    /**
     * @var ?float $contentThreshold A submission whose text scores at least this in a content category is spam. `null`: the environment's risk settings decide.
     */
    #[JsonProperty('content_threshold')]
    public ?float $contentThreshold;

    /**
     * @var value-of<FormSpamOnReview> $onReview When Risk's decision is `review`: `hold` keeps the submission until you release it, `deliver` delivers it.
     */
    #[JsonProperty('on_review')]
    public string $onReview;

    /**
     * @param array{
     *   honeypotField: string,
     *   captcha: value-of<FormSpamCaptcha>,
     *   onReview: value-of<FormSpamOnReview>,
     *   captchaSiteKey?: ?string,
     *   contentThreshold?: ?float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->honeypotField = $values['honeypotField'];
        $this->captcha = $values['captcha'];
        $this->captchaSiteKey = $values['captchaSiteKey'] ?? null;
        if (array_key_exists('captchaSiteKey', $values)) {
            $this->_setField('captchaSiteKey');
        }
        $this->contentThreshold = $values['contentThreshold'] ?? null;
        if (array_key_exists('contentThreshold', $values)) {
            $this->_setField('contentThreshold');
        }
        $this->onReview = $values['onReview'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
