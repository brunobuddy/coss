<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class SignDocument extends JsonSerializableType
{
    /**
     * @var value-of<SignDocumentObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $filename The file's name, as uploaded.
     */
    #[JsonProperty('filename')]
    public string $filename;

    /**
     * @var int $size Bytes.
     */
    #[JsonProperty('size')]
    public int $size;

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
     * @var array<SignDocumentPagesItem> $pages Each page's size, in order.
     */
    #[JsonProperty('pages'), ArrayType([SignDocumentPagesItem::class])]
    public array $pages;

    /**
     * @var array<SignDocumentAnchorsItem> $anchors Text anchors (`{{signature:signer_1}}`) found in the document, which fields can be placed by.
     */
    #[JsonProperty('anchors'), ArrayType([SignDocumentAnchorsItem::class])]
    public array $anchors;

    /**
     * @var bool $sandbox Whether it belongs to a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<SignDocumentObject>,
     *   id: string,
     *   filename: string,
     *   size: int,
     *   sha256: string,
     *   pageCount: int,
     *   pages: array<SignDocumentPagesItem>,
     *   anchors: array<SignDocumentAnchorsItem>,
     *   sandbox: bool,
     *   createdAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->filename = $values['filename'];
        $this->size = $values['size'];
        $this->sha256 = $values['sha256'];
        $this->pageCount = $values['pageCount'];
        $this->pages = $values['pages'];
        $this->anchors = $values['anchors'];
        $this->sandbox = $values['sandbox'];
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
