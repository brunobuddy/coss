<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * File uploads. Only the fields given change.
 */
class UpdateFormRequestFiles extends JsonSerializableType
{
    /**
     * @var ?bool $enabled Accept uploads (`multipart/form-data`). Default false.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @var ?int $maxFiles Most files per submission. Default 3.
     */
    #[JsonProperty('max_files')]
    public ?int $maxFiles;

    /**
     * @var ?int $maxFileBytes Largest file, in bytes. Default and maximum 10 MB.
     */
    #[JsonProperty('max_file_bytes')]
    public ?int $maxFileBytes;

    /**
     * @var ?array<string> $allowedTypes MIME types (`image/*` allowed). Empty: images, PDFs, text and Office.
     */
    #[JsonProperty('allowed_types'), ArrayType(['string'])]
    public ?array $allowedTypes;

    /**
     * @param array{
     *   enabled?: ?bool,
     *   maxFiles?: ?int,
     *   maxFileBytes?: ?int,
     *   allowedTypes?: ?array<string>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
        }
        $this->maxFiles = $values['maxFiles'] ?? null;
        if (array_key_exists('maxFiles', $values)) {
            $this->_setField('maxFiles');
        }
        $this->maxFileBytes = $values['maxFileBytes'] ?? null;
        if (array_key_exists('maxFileBytes', $values)) {
            $this->_setField('maxFileBytes');
        }
        $this->allowedTypes = $values['allowedTypes'] ?? null;
        if (array_key_exists('allowedTypes', $values)) {
            $this->_setField('allowedTypes');
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
