<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * A domain's receiving hostname: email sent to any address at it becomes a received email of its environment.
 */
class ReceivingDomain extends JsonSerializableType
{
    /**
     * @var string $hostname The hostname that receives email: the domain itself or a subdomain of it.
     */
    #[JsonProperty('hostname')]
    public string $hostname;

    /**
     * @var string $environmentId The environment its received emails are delivered to.
     */
    #[JsonProperty('environment_id')]
    public string $environmentId;

    /**
     * @var ReceivingDomainRecord $record The MX record to publish, with the result of the last check. Mail for the hostname is received as soon as it reaches coss.com; the check only shows what DNS serves.
     */
    #[JsonProperty('record')]
    public ReceivingDomainRecord $record;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var ?DateTime $lastCheckedAt When it was last checked. `null`: not yet.
     */
    #[JsonProperty('last_checked_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastCheckedAt;

    /**
     * @param array{
     *   hostname: string,
     *   environmentId: string,
     *   record: ReceivingDomainRecord,
     *   createdAt: DateTime,
     *   lastCheckedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->hostname = $values['hostname'];
        $this->environmentId = $values['environmentId'];
        $this->record = $values['record'];
        $this->createdAt = $values['createdAt'];
        $this->lastCheckedAt = $values['lastCheckedAt'] ?? null;
        if (array_key_exists('lastCheckedAt', $values)) {
            $this->_setField('lastCheckedAt');
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
