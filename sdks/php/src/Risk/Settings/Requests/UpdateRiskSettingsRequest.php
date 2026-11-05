<?php

namespace Coss\Risk\Settings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Risk\Settings\Types\UpdateRiskSettingsRequestDisabledReasonsItem;
use Coss\Core\Types\ArrayType;
use Coss\Risk\Settings\Types\UpdateRiskSettingsRequestCaptcha;
use Coss\Risk\Settings\Types\UpdateRiskSettingsRequestContentThresholds;
use Coss\Risk\Settings\Types\UpdateRiskSettingsRequestReasonWeights;

class UpdateRiskSettingsRequest extends JsonSerializableType
{
    /**
     * @var ?float $reviewThreshold Scores at or above it are `review`.
     */
    #[JsonProperty('review_threshold')]
    public ?float $reviewThreshold;

    /**
     * @var ?float $blockThreshold Scores at or above it are `block`.
     */
    #[JsonProperty('block_threshold')]
    public ?float $blockThreshold;

    /**
     * @var ?array<value-of<UpdateRiskSettingsRequestDisabledReasonsItem>> $disabledReasons Reasons that never fire in this environment. Replaces the list.
     */
    #[JsonProperty('disabled_reasons'), ArrayType(['string'])]
    public ?array $disabledReasons;

    /**
     * @var ?UpdateRiskSettingsRequestCaptcha $captcha `null` turns captcha verification off and deletes the secret.
     */
    #[JsonProperty('captcha')]
    public ?UpdateRiskSettingsRequestCaptcha $captcha;

    /**
     * @var ?UpdateRiskSettingsRequestContentThresholds $contentThresholds Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.
     */
    #[JsonProperty('content_thresholds')]
    public ?UpdateRiskSettingsRequestContentThresholds $contentThresholds;

    /**
     * @var ?UpdateRiskSettingsRequestReasonWeights $reasonWeights Changes the reasons given: a weight in [0, 0.99] replaces the default, `null` goes back to it.
     */
    #[JsonProperty('reason_weights')]
    public ?UpdateRiskSettingsRequestReasonWeights $reasonWeights;

    /**
     * @param array{
     *   reviewThreshold?: ?float,
     *   blockThreshold?: ?float,
     *   disabledReasons?: ?array<value-of<UpdateRiskSettingsRequestDisabledReasonsItem>>,
     *   captcha?: ?UpdateRiskSettingsRequestCaptcha,
     *   contentThresholds?: ?UpdateRiskSettingsRequestContentThresholds,
     *   reasonWeights?: ?UpdateRiskSettingsRequestReasonWeights,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->reviewThreshold = $values['reviewThreshold'] ?? null;
        if (array_key_exists('reviewThreshold', $values)) {
            $this->_setField('reviewThreshold');
        }
        $this->blockThreshold = $values['blockThreshold'] ?? null;
        if (array_key_exists('blockThreshold', $values)) {
            $this->_setField('blockThreshold');
        }
        $this->disabledReasons = $values['disabledReasons'] ?? null;
        if (array_key_exists('disabledReasons', $values)) {
            $this->_setField('disabledReasons');
        }
        $this->captcha = $values['captcha'] ?? null;
        if (array_key_exists('captcha', $values)) {
            $this->_setField('captcha');
        }
        $this->contentThresholds = $values['contentThresholds'] ?? null;
        if (array_key_exists('contentThresholds', $values)) {
            $this->_setField('contentThresholds');
        }
        $this->reasonWeights = $values['reasonWeights'] ?? null;
        if (array_key_exists('reasonWeights', $values)) {
            $this->_setField('reasonWeights');
        }
    }
}
