<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who sent the report.
 */
class DmarcReportSummaryReporter extends JsonSerializableType
{
    /**
     * @var string $orgName The reporting organization.
     */
    #[JsonProperty('org_name')]
    public string $orgName;

    /**
     * @var ?string $email Its contact address.
     */
    #[JsonProperty('email')]
    public ?string $email;

    /**
     * @param array{
     *   orgName: string,
     *   email?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->orgName = $values['orgName'];
        $this->email = $values['email'] ?? null;
        if (array_key_exists('email', $values)) {
            $this->_setField('email');
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
