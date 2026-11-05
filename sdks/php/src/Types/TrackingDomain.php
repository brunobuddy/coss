<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * A domain's custom tracking domain: open pixels and click redirects of emails sent from the domain use it while it is `active`.
 */
class TrackingDomain extends JsonSerializableType
{
    /**
     * @var string $hostname The tracking hostname, a subdomain of the domain.
     */
    #[JsonProperty('hostname')]
    public string $hostname;

    /**
     * @var value-of<TrackingDomainStatus> $status `pending` until the CNAME points at coss.com and its certificate is issued, `active` once links and open pixels of emails sent from the domain use it, `temporary_failure` when an active hostname stopped working (emails fall back to the default tracking host meanwhile), `failed` when setup gave up (72 hours) — restart it with the domain's verify endpoint. `deleting` is a removal in progress.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var TrackingDomainRecord $record The DNS record to publish, with the result of the last check.
     */
    #[JsonProperty('record')]
    public TrackingDomainRecord $record;

    /**
     * @var ?string $message What is holding the hostname up, when the certificate provider said.
     */
    #[JsonProperty('message')]
    public ?string $message;

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
     * @var ?DateTime $activatedAt When it became active. `null`: it isn't.
     */
    #[JsonProperty('activated_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $activatedAt;

    /**
     * @var ?DateTime $failedAt When it failed. `null`: it hasn't.
     */
    #[JsonProperty('failed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $failedAt;

    /**
     * @param array{
     *   hostname: string,
     *   status: value-of<TrackingDomainStatus>,
     *   record: TrackingDomainRecord,
     *   createdAt: DateTime,
     *   message?: ?string,
     *   lastCheckedAt?: ?DateTime,
     *   activatedAt?: ?DateTime,
     *   failedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->hostname = $values['hostname'];
        $this->status = $values['status'];
        $this->record = $values['record'];
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->createdAt = $values['createdAt'];
        $this->lastCheckedAt = $values['lastCheckedAt'] ?? null;
        if (array_key_exists('lastCheckedAt', $values)) {
            $this->_setField('lastCheckedAt');
        }
        $this->activatedAt = $values['activatedAt'] ?? null;
        if (array_key_exists('activatedAt', $values)) {
            $this->_setField('activatedAt');
        }
        $this->failedAt = $values['failedAt'] ?? null;
        if (array_key_exists('failedAt', $values)) {
            $this->_setField('failedAt');
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
