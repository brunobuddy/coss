<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SignDocumentPagesItem extends JsonSerializableType
{
    /**
     * @var float $width In PDF points (1/72 inch).
     */
    #[JsonProperty('width')]
    public float $width;

    /**
     * @var float $height In PDF points (1/72 inch).
     */
    #[JsonProperty('height')]
    public float $height;

    /**
     * @param array{
     *   width: float,
     *   height: float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->width = $values['width'];
        $this->height = $values['height'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
