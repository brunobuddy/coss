<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SignRequestDocumentsItem extends JsonSerializableType
{
    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $filename The file's name.
     */
    #[JsonProperty('filename')]
    public string $filename;

    /**
     * @var string $sha256 Hex SHA-256 of the uploaded bytes.
     */
    #[JsonProperty('sha256')]
    public string $sha256;

    /**
     * @var int $pageCount How many pages it has.
     */
    #[JsonProperty('page_count')]
    public int $pageCount;

    /**
     * @param array{
     *   id: string,
     *   filename: string,
     *   sha256: string,
     *   pageCount: int,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->filename = $values['filename'];
        $this->sha256 = $values['sha256'];
        $this->pageCount = $values['pageCount'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
