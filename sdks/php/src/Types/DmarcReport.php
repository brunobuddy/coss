<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class DmarcReport extends JsonSerializableType
{
    /**
     * @var value-of<DmarcReportObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $domainId The domain's id.
     */
    #[JsonProperty('domain_id')]
    public string $domainId;

    /**
     * @var DmarcReportReporter $reporter Who sent the report.
     */
    #[JsonProperty('reporter')]
    public DmarcReportReporter $reporter;

    /**
     * @var string $reportId The reporter's own id of the report.
     */
    #[JsonProperty('report_id')]
    public string $reportId;

    /**
     * @var DateTime $periodStart When the period it covers starts.
     */
    #[JsonProperty('period_start'), Date(Date::TYPE_DATETIME)]
    public DateTime $periodStart;

    /**
     * @var DateTime $periodEnd When the period it covers ends.
     */
    #[JsonProperty('period_end'), Date(Date::TYPE_DATETIME)]
    public DateTime $periodEnd;

    /**
     * @var DmarcReportPolicyPublished $policyPublished The policy the reporter found when it evaluated the mail.
     */
    #[JsonProperty('policy_published')]
    public DmarcReportPolicyPublished $policyPublished;

    /**
     * @var int $messages Messages the report covers.
     */
    #[JsonProperty('messages')]
    public int $messages;

    /**
     * @var int $passing Of those, how many passed DMARC.
     */
    #[JsonProperty('passing')]
    public int $passing;

    /**
     * @var bool $truncated The report listed more rows than are kept (10,000); totals cover the kept rows.
     */
    #[JsonProperty('truncated')]
    public bool $truncated;

    /**
     * @var DateTime $receivedAt When coss.com received it.
     */
    #[JsonProperty('received_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $receivedAt;

    /**
     * @var array<DmarcReportRecord> $records
     */
    #[JsonProperty('records'), ArrayType([DmarcReportRecord::class])]
    public array $records;

    /**
     * @param array{
     *   object: value-of<DmarcReportObject>,
     *   id: string,
     *   domainId: string,
     *   reporter: DmarcReportReporter,
     *   reportId: string,
     *   periodStart: DateTime,
     *   periodEnd: DateTime,
     *   policyPublished: DmarcReportPolicyPublished,
     *   messages: int,
     *   passing: int,
     *   truncated: bool,
     *   receivedAt: DateTime,
     *   records: array<DmarcReportRecord>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->domainId = $values['domainId'];
        $this->reporter = $values['reporter'];
        $this->reportId = $values['reportId'];
        $this->periodStart = $values['periodStart'];
        $this->periodEnd = $values['periodEnd'];
        $this->policyPublished = $values['policyPublished'];
        $this->messages = $values['messages'];
        $this->passing = $values['passing'];
        $this->truncated = $values['truncated'];
        $this->receivedAt = $values['receivedAt'];
        $this->records = $values['records'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
