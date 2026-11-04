<?php

namespace Coss\Sign\Templates\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestSigningOrder;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestDocumentsItemDocumentId;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestDocumentsItemContent;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestRolesItem;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestFieldsItemDocument;
use Coss\Sign\Templates\Types\UpdateSignTemplateRequestFieldsItemAnchor;

class UpdateSignTemplateRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Your name for the template.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $title Requests' title (a request may set its own). Default: `name`.
     */
    #[JsonProperty('title')]
    public ?string $title;

    /**
     * @var ?string $message Requests' message to signers (a request may set its own).
     */
    #[JsonProperty('message')]
    public ?string $message;

    /**
     * @var ?value-of<UpdateSignTemplateRequestSigningOrder> $signingOrder `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
     */
    #[JsonProperty('signing_order')]
    public ?string $signingOrder;

    /**
     * @var ?array<(
     *    UpdateSignTemplateRequestDocumentsItemDocumentId
     *   |UpdateSignTemplateRequestDocumentsItemContent
     * )> $documents Uploaded documents by id, or PDFs inline (base64).
     */
    #[JsonProperty('documents'), ArrayType([new Union(UpdateSignTemplateRequestDocumentsItemDocumentId::class, UpdateSignTemplateRequestDocumentsItemContent::class)])]
    public ?array $documents;

    /**
     * @var ?array<UpdateSignTemplateRequestRolesItem> $roles Who signs: each request names one signer per role.
     */
    #[JsonProperty('roles'), ArrayType([UpdateSignTemplateRequestRolesItem::class])]
    public ?array $roles;

    /**
     * @var ?array<(
     *    UpdateSignTemplateRequestFieldsItemDocument
     *   |UpdateSignTemplateRequestFieldsItemAnchor
     * )> $fields Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
     */
    #[JsonProperty('fields'), ArrayType([new Union(UpdateSignTemplateRequestFieldsItemDocument::class, UpdateSignTemplateRequestFieldsItemAnchor::class)])]
    public ?array $fields;

    /**
     * @param array{
     *   name?: ?string,
     *   title?: ?string,
     *   message?: ?string,
     *   signingOrder?: ?value-of<UpdateSignTemplateRequestSigningOrder>,
     *   documents?: ?array<(
     *    UpdateSignTemplateRequestDocumentsItemDocumentId
     *   |UpdateSignTemplateRequestDocumentsItemContent
     * )>,
     *   roles?: ?array<UpdateSignTemplateRequestRolesItem>,
     *   fields?: ?array<(
     *    UpdateSignTemplateRequestFieldsItemDocument
     *   |UpdateSignTemplateRequestFieldsItemAnchor
     * )>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->title = $values['title'] ?? null;
        if (array_key_exists('title', $values)) {
            $this->_setField('title');
        }
        $this->message = $values['message'] ?? null;
        if (array_key_exists('message', $values)) {
            $this->_setField('message');
        }
        $this->signingOrder = $values['signingOrder'] ?? null;
        if (array_key_exists('signingOrder', $values)) {
            $this->_setField('signingOrder');
        }
        $this->documents = $values['documents'] ?? null;
        if (array_key_exists('documents', $values)) {
            $this->_setField('documents');
        }
        $this->roles = $values['roles'] ?? null;
        if (array_key_exists('roles', $values)) {
            $this->_setField('roles');
        }
        $this->fields = $values['fields'] ?? null;
        if (array_key_exists('fields', $values)) {
            $this->_setField('fields');
        }
    }
}
