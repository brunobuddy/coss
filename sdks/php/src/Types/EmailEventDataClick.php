<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Only for `email.clicked`.
 */
class EmailEventDataClick extends JsonSerializableType
{
    /**
     * @var string $url The original link that was clicked.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var int $linkPosition Index of the link among the email's tracked links.
     */
    #[JsonProperty('link_position')]
    public int $linkPosition;

    /**
     * @var ?string $userAgent The client's `User-Agent`. `null`: not sent.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @param array{
     *   url: string,
     *   linkPosition: int,
     *   userAgent?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->url = $values['url'];
        $this->linkPosition = $values['linkPosition'];
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
