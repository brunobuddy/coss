<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class SuppressionCheck extends JsonSerializableType
{
    /**
     * @var value-of<SuppressionCheckObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $address The address checked.
     */
    #[JsonProperty('address')]
    public string $address;

    /**
     * @var bool $suppressed Whether a send (with the given category) would skip this address.
     */
    #[JsonProperty('suppressed')]
    public bool $suppressed;

    /**
     * @var array<Suppression> $suppressions The entries that match.
     */
    #[JsonProperty('suppressions'), ArrayType([Suppression::class])]
    public array $suppressions;

    /**
     * @param array{
     *   object: value-of<SuppressionCheckObject>,
     *   address: string,
     *   suppressed: bool,
     *   suppressions: array<Suppression>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->address = $values['address'];
        $this->suppressed = $values['suppressed'];
        $this->suppressions = $values['suppressions'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
