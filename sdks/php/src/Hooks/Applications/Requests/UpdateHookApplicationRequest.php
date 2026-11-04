<?php

namespace Coss\Hooks\Applications\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class UpdateHookApplicationRequest extends JsonSerializableType
{
    /**
     * @var ?string $name Shown to the application's users in the portal.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $uid `null` removes it.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var ?array<string, string> $metadata Replaces the metadata.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @param array{
     *   name?: ?string,
     *   uid?: ?string,
     *   metadata?: ?array<string, string>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
    }
}
