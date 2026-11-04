<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class Usage extends JsonSerializableType
{
    /**
     * @var value-of<UsageObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var value-of<UsageMeter> $meter What is counted, e.g. `email.recipients`.
     */
    #[JsonProperty('meter')]
    public string $meter;

    /**
     * @var ?string $dimension e.g. `country=US` for SMS; `null` for none.
     */
    #[JsonProperty('dimension')]
    public ?string $dimension;

    /**
     * @var ?string $environmentId Set with `group_by=environment`; `null` there for organization-wide usage (SMS numbers and registration fees).
     */
    #[JsonProperty('environment_id')]
    public ?string $environmentId;

    /**
     * @var ?string $projectId Set with `group_by=project` (`null`: organization-wide usage, or usage recorded before projects were).
     */
    #[JsonProperty('project_id')]
    public ?string $projectId;

    /**
     * @var ?string $apiKeyId Set with `group_by=api_key` (`null`: the dashboard, or usage recorded before keys were).
     */
    #[JsonProperty('api_key_id')]
    public ?string $apiKeyId;

    /**
     * @var ?string $userId Set with `group_by=user`: the member whose personal API key caused it (`null`: organization keys and the dashboard).
     */
    #[JsonProperty('user_id')]
    public ?string $userId;

    /**
     * @var DateTime $start When this bucket starts (inclusive).
     */
    #[JsonProperty('start'), Date(Date::TYPE_DATETIME)]
    public DateTime $start;

    /**
     * @var DateTime $end When this bucket ends (exclusive).
     */
    #[JsonProperty('end'), Date(Date::TYPE_DATETIME)]
    public DateTime $end;

    /**
     * @var int $quantity Units used in this bucket.
     */
    #[JsonProperty('quantity')]
    public int $quantity;

    /**
     * @param array{
     *   object: value-of<UsageObject>,
     *   meter: value-of<UsageMeter>,
     *   start: DateTime,
     *   end: DateTime,
     *   quantity: int,
     *   dimension?: ?string,
     *   environmentId?: ?string,
     *   projectId?: ?string,
     *   apiKeyId?: ?string,
     *   userId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->meter = $values['meter'];
        $this->dimension = $values['dimension'] ?? null;
        if (array_key_exists('dimension', $values)) {
            $this->_setField('dimension');
        }
        $this->environmentId = $values['environmentId'] ?? null;
        if (array_key_exists('environmentId', $values)) {
            $this->_setField('environmentId');
        }
        $this->projectId = $values['projectId'] ?? null;
        if (array_key_exists('projectId', $values)) {
            $this->_setField('projectId');
        }
        $this->apiKeyId = $values['apiKeyId'] ?? null;
        if (array_key_exists('apiKeyId', $values)) {
            $this->_setField('apiKeyId');
        }
        $this->userId = $values['userId'] ?? null;
        if (array_key_exists('userId', $values)) {
            $this->_setField('userId');
        }
        $this->start = $values['start'];
        $this->end = $values['end'];
        $this->quantity = $values['quantity'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
