<?php

namespace Coss\Hooks\EventTypes\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class UpdateHookEventTypeRequest extends JsonSerializableType
{
    /**
     * @var ?string $description What this event means, shown to your users. `null` removes it.
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
     * @var ?bool $archived `false` restores an archived type.
     */
    #[JsonProperty('archived')]
    public ?bool $archived;

    /**
     * @param array{
     *   description?: ?string,
     *   schema?: ?array<string, mixed>,
     *   examples?: ?array<array<string, mixed>>,
     *   archived?: ?bool,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
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
        $this->archived = $values['archived'] ?? null;
        if (array_key_exists('archived', $values)) {
            $this->_setField('archived');
        }
    }
}
