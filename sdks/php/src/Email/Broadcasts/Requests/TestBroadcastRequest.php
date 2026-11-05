<?php

namespace Coss\Email\Broadcasts\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class TestBroadcastRequest extends JsonSerializableType
{
    /**
     * @var array<string> $to Who gets the test, at most 5 addresses.
     */
    #[JsonProperty('to'), ArrayType(['string'])]
    public array $to;

    /**
     * @var ?string $contact A contact (id or address) whose values fill the template; default: fallbacks.
     */
    #[JsonProperty('contact')]
    public ?string $contact;

    /**
     * @param array{
     *   to: array<string>,
     *   contact?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->to = $values['to'];
        $this->contact = $values['contact'] ?? null;
        if (array_key_exists('contact', $values)) {
            $this->_setField('contact');
        }
    }
}
