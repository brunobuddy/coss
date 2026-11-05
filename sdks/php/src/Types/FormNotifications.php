<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Emails about accepted submissions.
 */
class FormNotifications extends JsonSerializableType
{
    /**
     * @var array<string> $recipients Who gets an email for each accepted submission.
     */
    #[JsonProperty('recipients'), ArrayType(['string'])]
    public array $recipients;

    /**
     * @var ?string $from The notification's sender. `null`: coss.com, as "<form name> via coss.com".
     */
    #[JsonProperty('from')]
    public ?string $from;

    /**
     * @param array{
     *   recipients: array<string>,
     *   from?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->recipients = $values['recipients'];
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
