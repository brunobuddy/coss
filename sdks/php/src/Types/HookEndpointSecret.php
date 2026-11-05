<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class HookEndpointSecret extends JsonSerializableType
{
    /**
     * @var value-of<HookEndpointSecretObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $secret The endpoint's `whsec_…` signing secret (Standard Webhooks).
     */
    #[JsonProperty('secret')]
    public string $secret;

    /**
     * @param array{
     *   object: value-of<HookEndpointSecretObject>,
     *   secret: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->secret = $values['secret'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
