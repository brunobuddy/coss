<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class Reputation extends JsonSerializableType
{
    /**
     * @var value-of<ReputationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<ReputationStatus> $status `good`, `warning` (a rate is approaching the suspension threshold) or `suspended` (live sending is refused until coss.com support reinstates the organization).
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var ?string $reason The trigger behind a `warning` or `suspended` status.
     */
    #[JsonProperty('reason')]
    public ?string $reason;

    /**
     * @var ?DateTime $statusChangedAt When `status` last changed. `null`: it never has.
     */
    #[JsonProperty('status_changed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $statusChangedAt;

    /**
     * @var ?DateTime $evaluatedAt When the checks below were computed; `null` before the first evaluation.
     */
    #[JsonProperty('evaluated_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $evaluatedAt;

    /**
     * @var ?ReputationWindow $window The period the checks cover (live environments only).
     */
    #[JsonProperty('window')]
    public ?ReputationWindow $window;

    /**
     * @var array<ReputationCheck> $checks The measurements behind `status`.
     */
    #[JsonProperty('checks'), ArrayType([ReputationCheck::class])]
    public array $checks;

    /**
     * @var MarketingStanding $marketing
     */
    #[JsonProperty('marketing')]
    public MarketingStanding $marketing;

    /**
     * @param array{
     *   object: value-of<ReputationObject>,
     *   status: value-of<ReputationStatus>,
     *   checks: array<ReputationCheck>,
     *   marketing: MarketingStanding,
     *   reason?: ?string,
     *   statusChangedAt?: ?DateTime,
     *   evaluatedAt?: ?DateTime,
     *   window?: ?ReputationWindow,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->status = $values['status'];
        $this->reason = $values['reason'] ?? null;
        if (array_key_exists('reason', $values)) {
            $this->_setField('reason');
        }
        $this->statusChangedAt = $values['statusChangedAt'] ?? null;
        if (array_key_exists('statusChangedAt', $values)) {
            $this->_setField('statusChangedAt');
        }
        $this->evaluatedAt = $values['evaluatedAt'] ?? null;
        if (array_key_exists('evaluatedAt', $values)) {
            $this->_setField('evaluatedAt');
        }
        $this->window = $values['window'] ?? null;
        if (array_key_exists('window', $values)) {
            $this->_setField('window');
        }
        $this->checks = $values['checks'];
        $this->marketing = $values['marketing'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
