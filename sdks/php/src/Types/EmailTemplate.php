<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class EmailTemplate extends JsonSerializableType
{
    /**
     * @var value-of<EmailTemplateObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?string $alias A name to send the template by instead of its id. `null`: none.
     */
    #[JsonProperty('alias')]
    public ?string $alias;

    /**
     * @var string $name Shown in the dashboard.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $description Your note about it. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?int $publishedVersion The version sends use; `null` until the draft is first published.
     */
    #[JsonProperty('published_version')]
    public ?int $publishedVersion;

    /**
     * @var ?DateTime $publishedAt When the published version was published. `null`: never.
     */
    #[JsonProperty('published_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $publishedAt;

    /**
     * @var bool $hasUnpublishedChanges Whether the draft was changed since it was last published.
     */
    #[JsonProperty('has_unpublished_changes')]
    public bool $hasUnpublishedChanges;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<EmailTemplateObject>,
     *   id: string,
     *   name: string,
     *   hasUnpublishedChanges: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   alias?: ?string,
     *   description?: ?string,
     *   publishedVersion?: ?int,
     *   publishedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->alias = $values['alias'] ?? null;
        if (array_key_exists('alias', $values)) {
            $this->_setField('alias');
        }
        $this->name = $values['name'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->publishedVersion = $values['publishedVersion'] ?? null;
        if (array_key_exists('publishedVersion', $values)) {
            $this->_setField('publishedVersion');
        }
        $this->publishedAt = $values['publishedAt'] ?? null;
        if (array_key_exists('publishedAt', $values)) {
            $this->_setField('publishedAt');
        }
        $this->hasUnpublishedChanges = $values['hasUnpublishedChanges'];
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
