<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Domain extends JsonSerializableType
{
    /**
     * @var value-of<DomainObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name The domain, lower-cased.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var value-of<DomainStatus> $status `pending` while the records are being checked, `verified` once they are, `temporary_failure` after a transient DNS problem, and `failed` when verification gave up (72 hours) — restart it with the verify endpoint. `deleting` is a removal in progress.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var bool $canSend Whether live keys may send from this domain right now.
     */
    #[JsonProperty('can_send')]
    public bool $canSend;

    /**
     * @var ?string $region The provider region it sends from. `null`: not set up there.
     */
    #[JsonProperty('region')]
    public ?string $region;

    /**
     * @var string $mailFromDomain The envelope sender subdomain bounces come back to.
     */
    #[JsonProperty('mail_from_domain')]
    public string $mailFromDomain;

    /**
     * @var value-of<DomainMailFromStatus> $mailFromStatus How setting up its bounce-handling `MAIL FROM` domain went.
     */
    #[JsonProperty('mail_from_status')]
    public string $mailFromStatus;

    /**
     * @var array<DomainRecord> $records The DNS records to publish, with the result of the last check.
     */
    #[JsonProperty('records'), ArrayType([DomainRecord::class])]
    public array $records;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var ?DateTime $lastCheckedAt When DNS was last checked. `null`: not yet.
     */
    #[JsonProperty('last_checked_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastCheckedAt;

    /**
     * @var ?DateTime $verifiedAt When it was verified. `null`: it isn't.
     */
    #[JsonProperty('verified_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $verifiedAt;

    /**
     * @var ?DateTime $failedAt When verification failed. `null`: it hasn't.
     */
    #[JsonProperty('failed_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $failedAt;

    /**
     * @var ?TrackingDomain $tracking
     */
    #[JsonProperty('tracking')]
    public ?TrackingDomain $tracking;

    /**
     * @var ?ReceivingDomain $receiving
     */
    #[JsonProperty('receiving')]
    public ?ReceivingDomain $receiving;

    /**
     * @var DomainBimi $bimi
     */
    #[JsonProperty('bimi')]
    public DomainBimi $bimi;

    /**
     * @var ?string $subaccountId The sub-account the domain belongs to (only it sends from it, with its own reputation); `null` for the organization's own.
     */
    #[JsonProperty('subaccount_id')]
    public ?string $subaccountId;

    /**
     * @var bool $sharedWithSubaccounts An organization's domain its sub-accounts may send from too.
     */
    #[JsonProperty('shared_with_subaccounts')]
    public bool $sharedWithSubaccounts;

    /**
     * @param array{
     *   object: value-of<DomainObject>,
     *   id: string,
     *   name: string,
     *   status: value-of<DomainStatus>,
     *   canSend: bool,
     *   mailFromDomain: string,
     *   mailFromStatus: value-of<DomainMailFromStatus>,
     *   records: array<DomainRecord>,
     *   createdAt: DateTime,
     *   bimi: DomainBimi,
     *   sharedWithSubaccounts: bool,
     *   region?: ?string,
     *   lastCheckedAt?: ?DateTime,
     *   verifiedAt?: ?DateTime,
     *   failedAt?: ?DateTime,
     *   tracking?: ?TrackingDomain,
     *   receiving?: ?ReceivingDomain,
     *   subaccountId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->status = $values['status'];
        $this->canSend = $values['canSend'];
        $this->region = $values['region'] ?? null;
        if (array_key_exists('region', $values)) {
            $this->_setField('region');
        }
        $this->mailFromDomain = $values['mailFromDomain'];
        $this->mailFromStatus = $values['mailFromStatus'];
        $this->records = $values['records'];
        $this->createdAt = $values['createdAt'];
        $this->lastCheckedAt = $values['lastCheckedAt'] ?? null;
        if (array_key_exists('lastCheckedAt', $values)) {
            $this->_setField('lastCheckedAt');
        }
        $this->verifiedAt = $values['verifiedAt'] ?? null;
        if (array_key_exists('verifiedAt', $values)) {
            $this->_setField('verifiedAt');
        }
        $this->failedAt = $values['failedAt'] ?? null;
        if (array_key_exists('failedAt', $values)) {
            $this->_setField('failedAt');
        }
        $this->tracking = $values['tracking'] ?? null;
        if (array_key_exists('tracking', $values)) {
            $this->_setField('tracking');
        }
        $this->receiving = $values['receiving'] ?? null;
        if (array_key_exists('receiving', $values)) {
            $this->_setField('receiving');
        }
        $this->bimi = $values['bimi'];
        $this->subaccountId = $values['subaccountId'] ?? null;
        if (array_key_exists('subaccountId', $values)) {
            $this->_setField('subaccountId');
        }
        $this->sharedWithSubaccounts = $values['sharedWithSubaccounts'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
