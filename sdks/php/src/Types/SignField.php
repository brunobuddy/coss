<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * A box on a page that one signer fills.
 */
class SignField extends JsonSerializableType
{
    /**
     * @var value-of<SignFieldObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $signerId The id of the signer who fills it.
     */
    #[JsonProperty('signer_id')]
    public string $signerId;

    /**
     * @var string $documentId The id of the document it's on.
     */
    #[JsonProperty('document_id')]
    public string $documentId;

    /**
     * @var value-of<SignFieldType> $type `signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.
     */
    #[JsonProperty('type')]
    public string $type;

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
     * @var bool $required Whether a signer can finish with it empty.
     */
    #[JsonProperty('required')]
    public bool $required;

    /**
     * @var ?string $label Shown to the signer. `null`: none.
     */
    #[JsonProperty('label')]
    public ?string $label;

    /**
     * @var ?string $anchor The text anchor it was placed by. `null`: placed by position.
     */
    #[JsonProperty('anchor')]
    public ?string $anchor;

    /**
     * @param array{
     *   object: value-of<SignFieldObject>,
     *   id: string,
     *   signerId: string,
     *   documentId: string,
     *   type: value-of<SignFieldType>,
     *   page: int,
     *   x: float,
     *   y: float,
     *   width: float,
     *   height: float,
     *   required: bool,
     *   label?: ?string,
     *   anchor?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->signerId = $values['signerId'];
        $this->documentId = $values['documentId'];
        $this->type = $values['type'];
        $this->page = $values['page'];
        $this->x = $values['x'];
        $this->y = $values['y'];
        $this->width = $values['width'];
        $this->height = $values['height'];
        $this->required = $values['required'];
        $this->label = $values['label'] ?? null;
        if (array_key_exists('label', $values)) {
            $this->_setField('label');
        }
        $this->anchor = $values['anchor'] ?? null;
        if (array_key_exists('anchor', $values)) {
            $this->_setField('anchor');
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
