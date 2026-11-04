<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * `caldav` connects a server with an app-specific password; `simulated` is a sandbox calendar for tests.
 */
class CreateCalendarConnectionRequest extends JsonSerializableType
{
    /**
     * @var (
     *    'caldav'
     *   |'simulated'
     *   |'_unknown'
     * ) $provider
     */
    public readonly string $provider;

    /**
     * @var (
     *    CreateCalendarConnectionRequestCaldav
     *   |CreateCalendarConnectionRequestSimulated
     *   |mixed
     * ) $value
     */
    public readonly mixed $value;

    /**
     * @param array{
     *   provider: (
     *    'caldav'
     *   |'simulated'
     *   |'_unknown'
     * ),
     *   value: (
     *    CreateCalendarConnectionRequestCaldav
     *   |CreateCalendarConnectionRequestSimulated
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
     * @param CreateCalendarConnectionRequestCaldav $caldav
     * @return CreateCalendarConnectionRequest
     */
    public static function caldav(CreateCalendarConnectionRequestCaldav $caldav): CreateCalendarConnectionRequest
    {
        return new CreateCalendarConnectionRequest([
            'provider' => 'caldav',
            'value' => $caldav,
        ]);
    }

    /**
     * @param CreateCalendarConnectionRequestSimulated $simulated
     * @return CreateCalendarConnectionRequest
     */
    public static function simulated(CreateCalendarConnectionRequestSimulated $simulated): CreateCalendarConnectionRequest
    {
        return new CreateCalendarConnectionRequest([
            'provider' => 'simulated',
            'value' => $simulated,
        ]);
    }

    /**
     * @return bool
     */
    public function isCaldav(): bool
    {
        return $this->value instanceof CreateCalendarConnectionRequestCaldav && $this->provider === 'caldav';
    }

    /**
     * @return CreateCalendarConnectionRequestCaldav
     */
    public function asCaldav(): CreateCalendarConnectionRequestCaldav
    {
        if (!($this->value instanceof CreateCalendarConnectionRequestCaldav && $this->provider === 'caldav')) {
            throw new Exception(
                "Expected caldav; got " . $this->provider . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isSimulated(): bool
    {
        return $this->value instanceof CreateCalendarConnectionRequestSimulated && $this->provider === 'simulated';
    }

    /**
     * @return CreateCalendarConnectionRequestSimulated
     */
    public function asSimulated(): CreateCalendarConnectionRequestSimulated
    {
        if (!($this->value instanceof CreateCalendarConnectionRequestSimulated && $this->provider === 'simulated')) {
            throw new Exception(
                "Expected simulated; got " . $this->provider . " with value of type " . get_debug_type($this->value),
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
            case 'caldav':
                $value = $this->asCaldav()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'simulated':
                $value = $this->asSimulated()->jsonSerialize();
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
            case 'caldav':
                $args['value'] = CreateCalendarConnectionRequestCaldav::jsonDeserialize($data);
                break;
            case 'simulated':
                $args['value'] = CreateCalendarConnectionRequestSimulated::jsonDeserialize($data);
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
