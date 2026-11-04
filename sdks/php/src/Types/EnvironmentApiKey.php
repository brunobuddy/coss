<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * The API key making this request.
 */
class EnvironmentApiKey extends JsonSerializableType
{
    /**
     * @var string $id The key's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?string $name The key's name. `null`: none.
     */
    #[JsonProperty('name')]
    public ?string $name;

    /**
     * @var ?string $start The key's first characters, as shown in the dashboard.
     */
    #[JsonProperty('start')]
    public ?string $start;

    /**
     * @var value-of<EnvironmentApiKeyAccess> $access `full`: every permission, including ones new products add later. `restricted`: only `permissions`, chosen when the key was created.
     */
    #[JsonProperty('access')]
    public string $access;

    /**
     * @var array<string> $permissions What the key may do now, as `resource:action` (the names `insufficient_permissions` errors use), e.g. `email:send`.
     */
    #[JsonProperty('permissions'), ArrayType(['string'])]
    public array $permissions;

    /**
     * @param array{
     *   id: string,
     *   access: value-of<EnvironmentApiKeyAccess>,
     *   permissions: array<string>,
     *   name?: ?string,
     *   start?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->name = $values['name'] ?? null;
        if (array_key_exists('name', $values)) {
            $this->_setField('name');
        }
        $this->start = $values['start'] ?? null;
        if (array_key_exists('start', $values)) {
            $this->_setField('start');
        }
        $this->access = $values['access'];
        $this->permissions = $values['permissions'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
