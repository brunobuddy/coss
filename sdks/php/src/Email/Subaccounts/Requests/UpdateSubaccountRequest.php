<?php

namespace Coss\Email\Subaccounts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Email\Subaccounts\Types\UpdateSubaccountRequestStatus;
use Coss\Email\Subaccounts\Types\UpdateSubaccountRequestQuotas;

class UpdateSubaccountRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Your name for it.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $uid `null` removes it.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?array<string, string> $metadata Replaces the metadata.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?value-of<UpdateSubaccountRequestStatus> $status `disabled` refuses its sends until it is `active` again.
     */
    #[JsonProperty('status')]
    public ?string $status;

    /**
     * @var ?UpdateSubaccountRequestQuotas $quotas Fields left out keep their value; `null` removes a quota.
     */
    #[JsonProperty('quotas')]
    public ?UpdateSubaccountRequestQuotas $quotas;

    /**
     * @param array{
     *   name?: ?string,
     *   uid?: ?string,
     *   metadata?: ?array<string, string>,
     *   status?: ?value-of<UpdateSubaccountRequestStatus>,
     *   quotas?: ?UpdateSubaccountRequestQuotas,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->status = $values['status'] ?? null;
        if (array_key_exists('status', $values)) {
            $this->_setField('status');
        }
        $this->quotas = $values['quotas'] ?? null;
        if (array_key_exists('quotas', $values)) {
            $this->_setField('quotas');
        }
    }
}
