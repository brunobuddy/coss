<?php

namespace Coss\Hooks\Endpoints\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SendHookTestRequest extends JsonSerializableType
{
    /**
     * @var string $eventType The event type to send as.
     */
    #[JsonProperty('event_type')]
    public string $eventType;

    /**
     * @var ?array<string, mixed> $payload Defaults to the event type's first example.
     */
    #[JsonProperty('payload'), ArrayType(['string' => 'mixed'])]
    public ?array $payload;

    /**
     * @param array{
     *   eventType: string,
     *   payload?: ?array<string, mixed>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->eventType = $values['eventType'];
        $this->payload = $values['payload'] ?? null;
        if (array_key_exists('payload', $values)) {
            $this->_setField('payload');
        }
    }
}
