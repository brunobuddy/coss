<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * Where this host meets. A host has at most one of each type.
 */
class SchedulingHostLocation extends JsonSerializableType
{
    /**
     * @var (
     *    'link'
     *   |'phone'
     *   |'in_person'
     *   |'_unknown'
     * ) $type
     */
    public readonly string $type;

    /**
     * @var (
     *    SchedulingHostLocationLink
     *   |SchedulingHostLocationPhone
     *   |SchedulingHostLocationInPerson
     *   |mixed
     * ) $value
     */
    public readonly mixed $value;

    /**
     * @param array{
     *   type: (
     *    'link'
     *   |'phone'
     *   |'in_person'
     *   |'_unknown'
     * ),
     *   value: (
     *    SchedulingHostLocationLink
     *   |SchedulingHostLocationPhone
     *   |SchedulingHostLocationInPerson
     *   |mixed
     * ),
     * } $values
     */
    private function __construct(
        array $values,
    ) {
        $this->type = $values['type'];
        $this->value = $values['value'];
    }

    /**
     * @param SchedulingHostLocationLink $link
     * @return SchedulingHostLocation
     */
    public static function link(SchedulingHostLocationLink $link): SchedulingHostLocation
    {
        return new SchedulingHostLocation([
            'type' => 'link',
            'value' => $link,
        ]);
    }

    /**
     * @param SchedulingHostLocationPhone $phone
     * @return SchedulingHostLocation
     */
    public static function phone(SchedulingHostLocationPhone $phone): SchedulingHostLocation
    {
        return new SchedulingHostLocation([
            'type' => 'phone',
            'value' => $phone,
        ]);
    }

    /**
     * @param SchedulingHostLocationInPerson $inPerson
     * @return SchedulingHostLocation
     */
    public static function inPerson(SchedulingHostLocationInPerson $inPerson): SchedulingHostLocation
    {
        return new SchedulingHostLocation([
            'type' => 'in_person',
            'value' => $inPerson,
        ]);
    }

    /**
     * @return bool
     */
    public function isLink(): bool
    {
        return $this->value instanceof SchedulingHostLocationLink && $this->type === 'link';
    }

    /**
     * @return SchedulingHostLocationLink
     */
    public function asLink(): SchedulingHostLocationLink
    {
        if (!($this->value instanceof SchedulingHostLocationLink && $this->type === 'link')) {
            throw new Exception(
                "Expected link; got " . $this->type . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isPhone(): bool
    {
        return $this->value instanceof SchedulingHostLocationPhone && $this->type === 'phone';
    }

    /**
     * @return SchedulingHostLocationPhone
     */
    public function asPhone(): SchedulingHostLocationPhone
    {
        if (!($this->value instanceof SchedulingHostLocationPhone && $this->type === 'phone')) {
            throw new Exception(
                "Expected phone; got " . $this->type . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isInPerson(): bool
    {
        return $this->value instanceof SchedulingHostLocationInPerson && $this->type === 'in_person';
    }

    /**
     * @return SchedulingHostLocationInPerson
     */
    public function asInPerson(): SchedulingHostLocationInPerson
    {
        if (!($this->value instanceof SchedulingHostLocationInPerson && $this->type === 'in_person')) {
            throw new Exception(
                "Expected in_person; got " . $this->type . " with value of type " . get_debug_type($this->value),
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
        $result['type'] = $this->type;

        $base = parent::jsonSerialize();
        $result = array_merge($base, $result);

        switch ($this->type) {
            case 'link':
                $value = $this->asLink()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'phone':
                $value = $this->asPhone()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'in_person':
                $value = $this->asInPerson()->jsonSerialize();
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
        if (!array_key_exists('type', $data)) {
            throw new Exception(
                "JSON data is missing property 'type'",
            );
        }
        $type = $data['type'];
        if (!(is_string($type))) {
            throw new Exception(
                "Expected property 'type' in JSON data to be string, instead received " . get_debug_type($data['type']),
            );
        }

        $args['type'] = $type;
        switch ($type) {
            case 'link':
                $args['value'] = SchedulingHostLocationLink::jsonDeserialize($data);
                break;
            case 'phone':
                $args['value'] = SchedulingHostLocationPhone::jsonDeserialize($data);
                break;
            case 'in_person':
                $args['value'] = SchedulingHostLocationInPerson::jsonDeserialize($data);
                break;
            case '_unknown':
            default:
                $args['type'] = '_unknown';
                $args['value'] = $data;
        }

        // @phpstan-ignore-next-line
        return new static($args);
    }
}
