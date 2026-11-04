<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

class CreateCalendarDelegationRequest extends JsonSerializableType
{
    /**
     * @var (
     *    'google'
     *   |'microsoft'
     *   |'_unknown'
     * ) $provider
     */
    public readonly string $provider;

    /**
     * @var (
     *    CreateCalendarDelegationRequestGoogle
     *   |CreateCalendarDelegationRequestMicrosoft
     *   |mixed
     * ) $value
     */
    public readonly mixed $value;

    /**
     * @param array{
     *   provider: (
     *    'google'
     *   |'microsoft'
     *   |'_unknown'
     * ),
     *   value: (
     *    CreateCalendarDelegationRequestGoogle
     *   |CreateCalendarDelegationRequestMicrosoft
     *   |mixed
     * ),
     * } $values
     */
    private function __construct(
        array $values,
    ) {
        $this->provider = $values['provider'];
        $this->value = $values['value'];
    }

    /**
     * @param CreateCalendarDelegationRequestGoogle $google
     * @return CreateCalendarDelegationRequest
     */
    public static function google(CreateCalendarDelegationRequestGoogle $google): CreateCalendarDelegationRequest
    {
        return new CreateCalendarDelegationRequest([
            'provider' => 'google',
            'value' => $google,
        ]);
    }

    /**
     * @param CreateCalendarDelegationRequestMicrosoft $microsoft
     * @return CreateCalendarDelegationRequest
     */
    public static function microsoft(CreateCalendarDelegationRequestMicrosoft $microsoft): CreateCalendarDelegationRequest
    {
        return new CreateCalendarDelegationRequest([
            'provider' => 'microsoft',
            'value' => $microsoft,
        ]);
    }

    /**
     * @return bool
     */
    public function isGoogle(): bool
    {
        return $this->value instanceof CreateCalendarDelegationRequestGoogle && $this->provider === 'google';
    }

    /**
     * @return CreateCalendarDelegationRequestGoogle
     */
    public function asGoogle(): CreateCalendarDelegationRequestGoogle
    {
        if (!($this->value instanceof CreateCalendarDelegationRequestGoogle && $this->provider === 'google')) {
            throw new Exception(
                "Expected google; got " . $this->provider . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isMicrosoft(): bool
    {
        return $this->value instanceof CreateCalendarDelegationRequestMicrosoft && $this->provider === 'microsoft';
    }

    /**
     * @return CreateCalendarDelegationRequestMicrosoft
     */
    public function asMicrosoft(): CreateCalendarDelegationRequestMicrosoft
    {
        if (!($this->value instanceof CreateCalendarDelegationRequestMicrosoft && $this->provider === 'microsoft')) {
            throw new Exception(
                "Expected microsoft; got " . $this->provider . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }

    /**
     * @return array<mixed>
     */
    public function jsonSerialize(): array
    {
        $result = [];
        $result['provider'] = $this->provider;

        $base = parent::jsonSerialize();
        $result = array_merge($base, $result);

        switch ($this->provider) {
            case 'google':
                $value = $this->asGoogle()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'microsoft':
                $value = $this->asMicrosoft()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case '_unknown':
            default:
                if (is_null($this->value)) {
                    break;
                }
                if ($this->value instanceof JsonSerializableType) {
                    $value = $this->value->jsonSerialize();
                    $result = array_merge($value, $result);
                } elseif (is_array($this->value)) {
                    $result = array_merge($this->value, $result);
                }
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function jsonDeserialize(array $data): static
    {
        $args = [];
        if (!array_key_exists('provider', $data)) {
            throw new Exception(
                "JSON data is missing property 'provider'",
            );
        }
        $provider = $data['provider'];
        if (!(is_string($provider))) {
            throw new Exception(
                "Expected property 'provider' in JSON data to be string, instead received " . get_debug_type($data['provider']),
            );
        }

        $args['provider'] = $provider;
        switch ($provider) {
            case 'google':
                $args['value'] = CreateCalendarDelegationRequestGoogle::jsonDeserialize($data);
                break;
            case 'microsoft':
                $args['value'] = CreateCalendarDelegationRequestMicrosoft::jsonDeserialize($data);
                break;
            case '_unknown':
            default:
                $args['provider'] = '_unknown';
                $args['value'] = $data;
        }

        // @phpstan-ignore-next-line
        return new static($args);
    }
}
