<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class DomainDmarc extends JsonSerializableType
{
    /**
     * @var value-of<DomainDmarcObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $domainId The domain's id.
     */
    #[JsonProperty('domain_id')]
    public string $domainId;

    /**
     * @var ?string $reportAddress Where the domain's DMARC aggregate reports go (`rua=mailto:…`). `null` when this deployment doesn't receive email.
     */
    #[JsonProperty('report_address')]
    public ?string $reportAddress;

    /**
     * @var ?DmarcPublishedRecord $record
     */
    #[JsonProperty('record')]
    public ?DmarcPublishedRecord $record;

    /**
     * @var ?value-of<DomainDmarcPolicy> $policy The policy receivers apply: the record's `p` (`none` when it has none), or for a subdomain without a record of its own, its organizational domain's `sp` (else `p`).
     */
    #[JsonProperty('policy')]
    public ?string $policy;

    /**
     * @var ?string $inheritedFrom The organizational domain whose DMARC record applies, when this domain publishes none of its own.
     */
    #[JsonProperty('inherited_from')]
    public ?string $inheritedFrom;

    /**
     * @var ?DateTime $policySince When a DNS check first saw the current policy.
     */
    #[JsonProperty('policy_since'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $policySince;

    /**
     * @var value-of<DomainDmarcStage> $stage Where the domain is on the path to enforcement: `not_checked` (DNS not checked yet), `no_record`, `monitoring` (`p=none`), `quarantine` or `reject`.
     */
    #[JsonProperty('stage')]
    public string $stage;

    /**
     * @var bool $partial The policy applies only partly (`pct` below 100, or `t=y`).
     */
    #[JsonProperty('partial')]
    public bool $partial;

    /**
     * @var bool $reporting The published record sends aggregate reports to `report_address`.
     */
    #[JsonProperty('reporting')]
    public bool $reporting;

    /**
     * @var bool $ready Whether `next` is safe to publish now.
     */
    #[JsonProperty('ready')]
    public bool $ready;

    /**
     * @var ?DomainDmarcNext $next The next step: `publish` a first record, `add_reporting` (send reports to coss.com), `complete_rollout` (drop `pct`/`t=y`) or `tighten` to the next policy. `null` at `p=reject`.
     */
    #[JsonProperty('next')]
    public ?DomainDmarcNext $next;

    /**
     * @var array<DomainDmarcChecksItem> $checks The readiness checks gating `next`, from the last 14 days of reports.
     */
    #[JsonProperty('checks'), ArrayType([DomainDmarcChecksItem::class])]
    public array $checks;

    /**
     * @var array<string> $warnings Things to look at before tightening the policy.
     */
    #[JsonProperty('warnings'), ArrayType(['string'])]
    public array $warnings;

    /**
     * @var DomainDmarcReportSummary $reportSummary What the aggregate reports of this period say.
     */
    #[JsonProperty('report_summary')]
    public DomainDmarcReportSummary $reportSummary;

    /**
     * @param array{
     *   object: value-of<DomainDmarcObject>,
     *   domainId: string,
     *   stage: value-of<DomainDmarcStage>,
     *   partial: bool,
     *   reporting: bool,
     *   ready: bool,
     *   checks: array<DomainDmarcChecksItem>,
     *   warnings: array<string>,
     *   reportSummary: DomainDmarcReportSummary,
     *   reportAddress?: ?string,
     *   record?: ?DmarcPublishedRecord,
     *   policy?: ?value-of<DomainDmarcPolicy>,
     *   inheritedFrom?: ?string,
     *   policySince?: ?DateTime,
     *   next?: ?DomainDmarcNext,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->domainId = $values['domainId'];
        $this->reportAddress = $values['reportAddress'] ?? null;
        if (array_key_exists('reportAddress', $values)) {
            $this->_setField('reportAddress');
        }
        $this->record = $values['record'] ?? null;
        if (array_key_exists('record', $values)) {
            $this->_setField('record');
        }
        $this->policy = $values['policy'] ?? null;
        if (array_key_exists('policy', $values)) {
            $this->_setField('policy');
        }
        $this->inheritedFrom = $values['inheritedFrom'] ?? null;
        if (array_key_exists('inheritedFrom', $values)) {
            $this->_setField('inheritedFrom');
        }
        $this->policySince = $values['policySince'] ?? null;
        if (array_key_exists('policySince', $values)) {
            $this->_setField('policySince');
        }
        $this->stage = $values['stage'];
        $this->partial = $values['partial'];
        $this->reporting = $values['reporting'];
        $this->ready = $values['ready'];
        $this->next = $values['next'] ?? null;
        if (array_key_exists('next', $values)) {
            $this->_setField('next');
        }
        $this->checks = $values['checks'];
        $this->warnings = $values['warnings'];
        $this->reportSummary = $values['reportSummary'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
