<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SignRequestSignedDocument extends JsonSerializableType
{
    /**
     * @var string $sha256 Hex SHA-256 of the sealed PDF.
     */
    #[JsonProperty('sha256')]
    public string $sha256;

    /**
     * @var DateTime $sealedAt When it was sealed.
     */
    #[JsonProperty('sealed_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $sealedAt;

    /**
     * @param array{
     *   sha256: string,
     *   sealedAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->sha256 = $values['sha256'];
        $this->sealedAt = $values['sealedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
