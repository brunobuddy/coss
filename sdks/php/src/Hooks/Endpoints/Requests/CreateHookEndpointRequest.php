<?php

namespace Coss\Hooks\Endpoints\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class CreateHookEndpointRequest extends JsonSerializableType
{
    /**
     * @var string $url
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var ?string $description Your note about it.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?array<string> $filterTypes Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
     */
    #[JsonProperty('filter_types'), ArrayType(['string'])]
    public ?array $filterTypes;

    /**
     * @var ?string $secret A `whsec_` + base64 secret of 24-64 bytes to sign with, e.g. when migrating from another provider. Generated when omitted.
     */
    #[JsonProperty('secret')]
    public ?string $secret;

    /**
     * @var ?int $rateLimitPerSecond At most this many requests per second to this endpoint.
     */
    #[JsonProperty('rate_limit_per_second')]
    public ?int $rateLimitPerSecond;

    /**
     * @var ?array<string, string> $metadata Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public ?array $metadata;

    /**
     * @var ?bool $enabled Default `true`. `false` creates it disabled, with `disabled_reason: manual`.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

    /**
     * @param array{
     *   url: string,
     *   description?: ?string,
     *   filterTypes?: ?array<string>,
     *   secret?: ?string,
     *   rateLimitPerSecond?: ?int,
     *   metadata?: ?array<string, string>,
     *   enabled?: ?bool,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->url = $values['url'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->filterTypes = $values['filterTypes'] ?? null;
        if (array_key_exists('filterTypes', $values)) {
            $this->_setField('filterTypes');
        }
        $this->secret = $values['secret'] ?? null;
        if (array_key_exists('secret', $values)) {
            $this->_setField('secret');
        }
        $this->rateLimitPerSecond = $values['rateLimitPerSecond'] ?? null;
        if (array_key_exists('rateLimitPerSecond', $values)) {
            $this->_setField('rateLimitPerSecond');
        }
        $this->metadata = $values['metadata'] ?? null;
        if (array_key_exists('metadata', $values)) {
            $this->_setField('metadata');
        }
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
        }
    }
}
