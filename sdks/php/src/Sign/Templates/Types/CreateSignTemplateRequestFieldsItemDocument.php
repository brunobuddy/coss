<?php

namespace Coss\Sign\Templates\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateSignTemplateRequestFieldsItemDocument extends JsonSerializableType
{
    /**
     * @var value-of<CreateSignTemplateRequestFieldsItemDocumentType> $type `signature` and `initials` take the signer's adopted signature, `date_signed` is filled with the signing date, `name` and `email` with the signer's, `text` and `checkbox` by the signer.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?bool $required Default `true`. A signer can't finish with a required field empty.
     */
    #[JsonProperty('required')]
    public ?bool $required;

    /**
     * @var ?string $label Shown to the signer.
     */
    #[JsonProperty('label')]
    public ?string $label;

    /**
     * @var ?int $document Index of the document in `documents` (default 0).
     */
    #[JsonProperty('document')]
    public ?int $document;

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
     * @var string $role The role's key, e.g. `client`.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var ?string $mergeKey `text` fields only: filled from the request's `merge_fields[merge_key]` (shown to the signer, not editable). Without a value, the signer fills it.
     */
    #[JsonProperty('merge_key')]
    public ?string $mergeKey;

    /**
     * @param array{
     *   type: value-of<CreateSignTemplateRequestFieldsItemDocumentType>,
     *   page: int,
     *   x: float,
     *   y: float,
     *   width: float,
     *   height: float,
     *   role: string,
     *   required?: ?bool,
     *   label?: ?string,
     *   document?: ?int,
     *   mergeKey?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->required = $values['required'] ?? null;
        if (array_key_exists('required', $values)) {
            $this->_setField('required');
        }
        $this->label = $values['label'] ?? null;
        if (array_key_exists('label', $values)) {
            $this->_setField('label');
        }
        $this->document = $values['document'] ?? null;
        if (array_key_exists('document', $values)) {
            $this->_setField('document');
        }
        $this->page = $values['page'];
        $this->x = $values['x'];
        $this->y = $values['y'];
        $this->width = $values['width'];
        $this->height = $values['height'];
        $this->role = $values['role'];
        $this->mergeKey = $values['mergeKey'] ?? null;
        if (array_key_exists('mergeKey', $values)) {
            $this->_setField('mergeKey');
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
