<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Per category, the model's probability (0-1) that the content belongs to it. Scores are not calibrated: pick thresholds by looking at your own traffic.
 */
class RiskContentSignals extends JsonSerializableType
{
    /**
     * @var float $spam The model's probability (0-1) that it's spam.
     */
    #[JsonProperty('spam')]
    public float $spam;

    /**
     * @var float $phishing The model's probability (0-1) that it's phishing.
     */
    #[JsonProperty('phishing')]
    public float $phishing;

    /**
     * @var float $malware The model's probability (0-1) that it's malware.
     */
    #[JsonProperty('malware')]
    public float $malware;

    /**
     * @var float $fraud The model's probability (0-1) that it's fraud.
     */
    #[JsonProperty('fraud')]
    public float $fraud;

    /**
     * @param array{
     *   spam: float,
     *   phishing: float,
     *   malware: float,
     *   fraud: float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->spam = $values['spam'];
        $this->phishing = $values['phishing'];
        $this->malware = $values['malware'];
        $this->fraud = $values['fraud'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
