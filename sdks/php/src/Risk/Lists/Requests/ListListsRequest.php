<?php

namespace Coss\Risk\Lists\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Types\RiskList;
use Coss\Types\RiskListEntryType;

class ListListsRequest extends JsonSerializableType
{
    /**
     * @var ?value-of<RiskList> $list Which list: `allow` or `block`.
     */
    public ?string $list;

    /**
     * @var ?value-of<RiskListEntryType> $type `email` (matched by mailbox, dots and `+tags` folded), `domain` (subdomains included), `ip` (an address or CIDR range), `asn`, `country` (ISO 3166-1 alpha-2), `user` (your user id).
     */
    public ?string $type;

    /**
     * @var ?int $limit 1-100, default 50.
     */
    public ?int $limit;

    /**
     * @var ?string $after Cursor: the `id` of the last entry of the previous page.
     */
    public ?string $after;

    /**
     * @param array{
     *   list?: ?value-of<RiskList>,
     *   type?: ?value-of<RiskListEntryType>,
     *   limit?: ?int,
     *   after?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->list = $values['list'] ?? null;
        if (array_key_exists('list', $values)) {
            $this->_setField('list');
        }
        $this->type = $values['type'] ?? null;
        if (array_key_exists('type', $values)) {
            $this->_setField('type');
        }
        $this->limit = $values['limit'] ?? null;
        if (array_key_exists('limit', $values)) {
            $this->_setField('limit');
        }
        $this->after = $values['after'] ?? null;
        if (array_key_exists('after', $values)) {
            $this->_setField('after');
        }
    }
}
