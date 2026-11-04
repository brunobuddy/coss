<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * Open and click tracking and one-click unsubscribe settings of the API key's environment. For each of `opens`, `clicks` and `unsubscribe`, a send's own `tracking` wins, then its category's rule, then `default` (the environment default; `null` when none is set), then off.
 */
class TrackingSettings extends JsonSerializableType
{
    /**
     * @var value-of<TrackingSettingsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var ?TrackingRule $default The environment's tracking default. `null`: none is set.
     */
    #[JsonProperty('default')]
    public ?TrackingRule $default;

    /**
     * @var array<TrackingRule> $categories Category rules, by category name.
     */
    #[JsonProperty('categories'), ArrayType([TrackingRule::class])]
    public array $categories;

    /**
     * @param array{
     *   object: value-of<TrackingSettingsObject>,
     *   categories: array<TrackingRule>,
     *   default?: ?TrackingRule,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->default = $values['default'] ?? null;
        if (array_key_exists('default', $values)) {
            $this->_setField('default');
        }
        $this->categories = $values['categories'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
