<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * File uploads.
 */
class FormFiles extends JsonSerializableType
{
    /**
     * @var bool $enabled Whether uploads are accepted (`multipart/form-data`).
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var int $maxFiles Most files per submission.
     */
    #[JsonProperty('max_files')]
    public int $maxFiles;

    /**
     * @var int $maxFileBytes Largest file, in bytes.
     */
    #[JsonProperty('max_file_bytes')]
    public int $maxFileBytes;

    /**
     * @var array<string> $allowedTypes MIME types accepted. Empty: images, PDFs, text and Office.
     */
    #[JsonProperty('allowed_types'), ArrayType(['string'])]
    public array $allowedTypes;

    /**
     * @param array{
     *   enabled: bool,
     *   maxFiles: int,
     *   maxFileBytes: int,
     *   allowedTypes: array<string>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->enabled = $values['enabled'];
        $this->maxFiles = $values['maxFiles'];
        $this->maxFileBytes = $values['maxFileBytes'];
        $this->allowedTypes = $values['allowedTypes'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
