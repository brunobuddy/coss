<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class FormSubmissionFile extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $field The form field it was uploaded through.
     */
    #[JsonProperty('field')]
    public string $field;

    /**
     * @var string $filename The file's name, made safe.
     */
    #[JsonProperty('filename')]
    public string $filename;

    /**
     * @var string $contentType The MIME type it was uploaded as.
     */
    #[JsonProperty('content_type')]
    public string $contentType;

    /**
     * @var int $size Bytes.
     */
    #[JsonProperty('size')]
    public int $size;

    /**
     * @param array{
     *   id: string,
     *   field: string,
     *   filename: string,
     *   contentType: string,
     *   size: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->field = $values['field'];
        $this->filename = $values['filename'];
        $this->contentType = $values['contentType'];
        $this->size = $values['size'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
