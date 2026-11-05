<?php

namespace Coss\Email\Contacts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Email\Contacts\Types\ImportContactsRequestContactsItem;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class ImportContactsRequest extends JsonSerializableType
{
    /**
     * @var array<ImportContactsRequestContactsItem> $contacts The contacts to create or update, at most 1,000.
     */
    #[JsonProperty('contacts'), ArrayType([ImportContactsRequestContactsItem::class])]
    public array $contacts;

    /**
     * @var ?string $audienceId Adds every imported contact to this audience.
     */
    #[JsonProperty('audience_id')]
    public ?string $audienceId;

    /**
     * @param array{
     *   contacts: array<ImportContactsRequestContactsItem>,
     *   audienceId?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->contacts = $values['contacts'];
        $this->audienceId = $values['audienceId'] ?? null;
        if (array_key_exists('audienceId', $values)) {
            $this->_setField('audienceId');
        }
    }
}
