<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Only for `email.opened`.
 */
class EmailEventDataOpen extends JsonSerializableType
{
    /**
     * @var ?string $userAgent The client's `User-Agent`. `null`: not sent.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @param array{
     *   userAgent?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->userAgent = $values['userAgent'] ?? null;
        if (array_key_exists('userAgent', $values)) {
            $this->_setField('userAgent');
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
