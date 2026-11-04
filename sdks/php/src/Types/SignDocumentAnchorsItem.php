<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * A text anchor found in the document, in points from the page's top left.
 */
class SignDocumentAnchorsItem extends JsonSerializableType
{
    /**
     * @var string $text The anchor as it appears in the document.
     */
    #[JsonProperty('text')]
    public string $text;

    /**
     * @var int $page 1-based page number.
     */
    #[JsonProperty('page')]
    public int $page;

    /**
     * @var float $x Left edge, in PDF points from the page's left.
     */
    #[JsonProperty('x')]
    public float $x;

    /**
     * @var float $y Top edge, in PDF points from the page's top.
     */
    #[JsonProperty('y')]
    public float $y;

    /**
     * @var float $width In PDF points.
     */
    #[JsonProperty('width')]
    public float $width;

    /**
     * @var float $height In PDF points.
     */
    #[JsonProperty('height')]
    public float $height;

    /**
     * @param array{
     *   text: string,
     *   page: int,
     *   x: float,
     *   y: float,
     *   width: float,
     *   height: float,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->text = $values['text'];
        $this->page = $values['page'];
        $this->x = $values['x'];
        $this->y = $values['y'];
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
