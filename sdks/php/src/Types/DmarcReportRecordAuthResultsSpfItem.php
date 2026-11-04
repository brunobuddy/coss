<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class DmarcReportRecordAuthResultsSpfItem extends JsonSerializableType
{
    /**
     * @var string $domain The checked domain.
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var ?string $scope What it was checked against.
     */
    #[JsonProperty('scope')]
    public ?string $scope;

    /**
     * @var string $result The result.
     */
    #[JsonProperty('result')]
    public string $result;

    /**
     * @param array{
     *   domain: string,
     *   result: string,
     *   scope?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->domain = $values['domain'];
        $this->scope = $values['scope'] ?? null;
        if (array_key_exists('scope', $values)) {
            $this->_setField('scope');
        }
        $this->result = $values['result'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
