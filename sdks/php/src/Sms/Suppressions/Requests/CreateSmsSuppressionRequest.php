<?php

namespace Coss\Sms\Suppressions\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateSmsSuppressionRequest extends JsonSerializableType
{
    /**
     * @var string $phoneNumber The number to suppress, in E.164.
     */
    #[JsonProperty('phone_number')]
    public string $phoneNumber;

    /**
     * @param array{
     *   phoneNumber: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->phoneNumber = $values['phoneNumber'];
    }
}
