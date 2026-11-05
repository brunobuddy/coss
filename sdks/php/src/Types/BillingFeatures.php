<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Which features the plan includes.
 */
class BillingFeatures extends JsonSerializableType
{
    /**
     * @var bool $trackingDomains Custom tracking domains.
     */
    #[JsonProperty('tracking_domains')]
    public bool $trackingDomains;

    /**
     * @var bool $auditLog The organization's audit log.
     */
    #[JsonProperty('audit_log')]
    public bool $auditLog;

    /**
     * @var bool $logDrains Log drains.
     */
    #[JsonProperty('log_drains')]
    public bool $logDrains;

    /**
     * @var bool $sso Single sign-on.
     */
    #[JsonProperty('sso')]
    public bool $sso;

    /**
     * @var bool $scim Directory sync (SCIM).
     */
    #[JsonProperty('scim')]
    public bool $scim;

    /**
     * @var bool $dedicatedIps Dedicated IP pools.
     */
    #[JsonProperty('dedicated_ips')]
    public bool $dedicatedIps;

    /**
     * @param array{
     *   trackingDomains: bool,
     *   auditLog: bool,
     *   logDrains: bool,
     *   sso: bool,
     *   scim: bool,
     *   dedicatedIps: bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->trackingDomains = $values['trackingDomains'];
        $this->auditLog = $values['auditLog'];
        $this->logDrains = $values['logDrains'];
        $this->sso = $values['sso'];
        $this->scim = $values['scim'];
        $this->dedicatedIps = $values['dedicatedIps'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
