<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class DmarcReportRecordReasonsItem extends JsonSerializableType
{
    /**
     * @var string $type The kind of override.
     */
    #[JsonProperty('type')]
    public string $type;

    /**
     * @var ?string $comment The receiver's comment.
     */
    #[JsonProperty('comment')]
    public ?string $comment;

    /**
     * @param array{
     *   type: string,
     *   comment?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->comment = $values['comment'] ?? null;
        if (array_key_exists('comment', $values)) {
            $this->_setField('comment');
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
