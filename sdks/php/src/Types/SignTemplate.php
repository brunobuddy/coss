<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class SignTemplate extends JsonSerializableType
{
    /**
     * @var value-of<SignTemplateObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name Your name for the template.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $title Requests' title. `null`: the template's name.
     */
    #[JsonProperty('title')]
    public ?string $title;

    /**
     * @var ?string $message Requests' message to signers. `null`: none.
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var value-of<SignTemplateSigningOrder> $signingOrder Its requests' order, unless one sets its own.
     */
    #[JsonProperty('signing_order')]
    public string $signingOrder;

    /**
     * @var array<SignTemplateDocumentsItem> $documents The documents its requests use, in order.
     */
    #[JsonProperty('documents'), ArrayType([SignTemplateDocumentsItem::class])]
    public array $documents;

    /**
     * @var array<SignTemplateRolesItem> $roles Who signs: each request names one signer per role.
     */
    #[JsonProperty('roles'), ArrayType([SignTemplateRolesItem::class])]
    public array $roles;

    /**
     * @var array<SignTemplateFieldsItem> $fields Each role's fields.
     */
    #[JsonProperty('fields'), ArrayType([SignTemplateFieldsItem::class])]
    public array $fields;

    /**
     * @var bool $ready It has documents and every role has a `signature` field, so requests can be made from it.
     */
    #[JsonProperty('ready')]
    public bool $ready;

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
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<SignTemplateObject>,
     *   id: string,
     *   name: string,
     *   signingOrder: value-of<SignTemplateSigningOrder>,
     *   documents: array<SignTemplateDocumentsItem>,
     *   roles: array<SignTemplateRolesItem>,
     *   fields: array<SignTemplateFieldsItem>,
     *   ready: bool,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   title?: ?string,
     *   message?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->title = $values['title'] ?? null;
        if (array_key_exists('title', $values)) {
            $this->_setField('title');
        }
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->signingOrder = $values['signingOrder'];
        $this->documents = $values['documents'];
        $this->roles = $values['roles'];
        $this->fields = $values['fields'];
        $this->ready = $values['ready'];
        $this->sandbox = $values['sandbox'];
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
