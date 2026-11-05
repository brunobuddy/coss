<?php

namespace Coss\Sign\Templates\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestSigningOrder;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestDocumentsItemDocumentId;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestDocumentsItemContent;
use Coss\Core\Types\ArrayType;
use Coss\Core\Types\Union;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestRolesItem;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestFieldsItemDocument;
use Coss\Sign\Templates\Types\CreateSignTemplateRequestFieldsItemAnchor;

class CreateSignTemplateRequest extends JsonSerializableType
{
    /**
     * @var string $name Your name for the template.
     */
    #[JsonProperty('name')]
    public string $name;

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
     * @var ?value-of<CreateSignTemplateRequestSigningOrder> $signingOrder `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
     */
    #[JsonProperty('signing_order')]
    public ?string $signingOrder;

    /**
     * @var ?array<(
     *    CreateSignTemplateRequestDocumentsItemDocumentId
     *   |CreateSignTemplateRequestDocumentsItemContent
     * )> $documents Uploaded documents by id, or PDFs inline (base64).
     */
    #[JsonProperty('documents'), ArrayType([new Union(CreateSignTemplateRequestDocumentsItemDocumentId::class, CreateSignTemplateRequestDocumentsItemContent::class)])]
    public ?array $documents;

    /**
     * @var ?array<CreateSignTemplateRequestRolesItem> $roles Who signs: each request names one signer per role.
     */
    #[JsonProperty('roles'), ArrayType([CreateSignTemplateRequestRolesItem::class])]
    public ?array $roles;

    /**
     * @var ?array<(
     *    CreateSignTemplateRequestFieldsItemDocument
     *   |CreateSignTemplateRequestFieldsItemAnchor
     * )> $fields Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
     */
    #[JsonProperty('fields'), ArrayType([new Union(CreateSignTemplateRequestFieldsItemDocument::class, CreateSignTemplateRequestFieldsItemAnchor::class)])]
    public ?array $fields;

    /**
     * @param array{
     *   name: string,
     *   title?: ?string,
     *   message?: ?string,
     *   signingOrder?: ?value-of<CreateSignTemplateRequestSigningOrder>,
     *   documents?: ?array<(
     *    CreateSignTemplateRequestDocumentsItemDocumentId
     *   |CreateSignTemplateRequestDocumentsItemContent
     * )>,
     *   roles?: ?array<CreateSignTemplateRequestRolesItem>,
     *   fields?: ?array<(
     *    CreateSignTemplateRequestFieldsItemDocument
     *   |CreateSignTemplateRequestFieldsItemAnchor
     * )>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
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
