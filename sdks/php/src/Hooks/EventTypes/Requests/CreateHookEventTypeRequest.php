<?php

namespace Coss\Hooks\EventTypes\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class CreateHookEventTypeRequest extends JsonSerializableType
{
    /**
     * @var string $name The type's name, which messages send as `event_type`. Letters, digits and `. _ -`.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $description What this event means, shown to your users.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?array<string, mixed> $schema A JSON Schema of the payload, shown to your users (not enforced).
     */
    #[JsonProperty('schema'), ArrayType(['string' => 'mixed'])]
    public ?array $schema;

    /**
     * @var ?array<array<string, mixed>> $examples Up to 5 example payloads; the first is what a test send delivers.
     */
    #[JsonProperty('examples'), ArrayType([['string' => 'mixed']])]
    public ?array $examples;

    /**
     * @param array{
     *   name: string,
     *   description?: ?string,
     *   schema?: ?array<string, mixed>,
     *   examples?: ?array<array<string, mixed>>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->schema = $values['schema'] ?? null;
        if (array_key_exists('schema', $values)) {
            $this->_setField('schema');
        }
        $this->examples = $values['examples'] ?? null;
        if (array_key_exists('examples', $values)) {
            $this->_setField('examples');
        }
    }
}
