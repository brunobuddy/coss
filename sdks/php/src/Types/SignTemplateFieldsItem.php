<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SignTemplateFieldsItem extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $role The `key` of the role that fills it.
     */
    #[JsonProperty('role')]
    public string $role;

    /**
     * @var string $documentId The id of the document it's on.
     */
    #[JsonProperty('document_id')]
    public string $documentId;

    /**
     * @var value-of<SignTemplateFieldsItemType> $type What the field takes, as on a signature request.
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
     * @var ?string $mergeKey `text` fields: which `merge_fields` value fills it. `null`: the signer fills it.
     */
    #[JsonProperty('merge_key')]
    public ?string $mergeKey;

    /**
     * @param array{
     *   id: string,
     *   role: string,
     *   documentId: string,
     *   type: value-of<SignTemplateFieldsItemType>,
     *   page: int,
     *   x: float,
     *   y: float,
     *   width: float,
     *   height: float,
     *   required: bool,
     *   label?: ?string,
     *   mergeKey?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->role = $values['role'];
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
