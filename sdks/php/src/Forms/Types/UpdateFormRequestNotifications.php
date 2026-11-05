<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Emails about accepted submissions. Only the fields given change.
 */
class UpdateFormRequestNotifications extends JsonSerializableType
{
    /**
     * @var ?array<string> $recipients Who gets an email for each accepted submission: members of your organization, or addresses on its verified domains.
     */
    #[JsonProperty('recipients'), ArrayType(['string'])]
    public ?array $recipients;

    /**
     * @var ?string $from The notification's sender, on a verified domain in live environments. `null`: coss.com, as "<form name> via coss.com".
     */
    #[JsonProperty('from')]
    public ?string $from;

    /**
     * @param array{
     *   recipients?: ?array<string>,
     *   from?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->recipients = $values['recipients'] ?? null;
        if (array_key_exists('recipients', $values)) {
            $this->_setField('recipients');
        }
        $this->from = $values['from'] ?? null;
        if (array_key_exists('from', $values)) {
            $this->_setField('from');
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
