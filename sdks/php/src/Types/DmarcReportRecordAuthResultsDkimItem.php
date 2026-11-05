<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class DmarcReportRecordAuthResultsDkimItem extends JsonSerializableType
{
    /**
     * @var string $domain The signing domain.
     */
    #[JsonProperty('domain')]
    public string $domain;

    /**
     * @var ?string $selector The selector.
     */
    #[JsonProperty('selector')]
    public ?string $selector;

    /**
     * @var string $result The result.
     */
    #[JsonProperty('result')]
    public string $result;

    /**
     * @param array{
     *   domain: string,
     *   result: string,
     *   selector?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->domain = $values['domain'];
        $this->selector = $values['selector'] ?? null;
        if (array_key_exists('selector', $values)) {
            $this->_setField('selector');
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
