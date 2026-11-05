<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Only for `email.suppressed` without `suppression`: the recipient is a contact who unsubscribed (from marketing, or from the email's topic, `topic`).
 */
class EmailEventDataUnsubscribe extends JsonSerializableType
{
    /**
     * @var ?string $contactId The contact who unsubscribed. `null`: none.
     */
    #[JsonProperty('contact_id')]
    public ?string $contactId;

    /**
     * @var ?string $topic The topic they left. `null`: marketing altogether.
     */
    #[JsonProperty('topic')]
    public ?string $topic;

    /**
     * @param array{
     *   contactId?: ?string,
     *   topic?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->contactId = $values['contactId'] ?? null;
        if (array_key_exists('contactId', $values)) {
            $this->_setField('contactId');
        }
        $this->topic = $values['topic'] ?? null;
        if (array_key_exists('topic', $values)) {
            $this->_setField('topic');
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
