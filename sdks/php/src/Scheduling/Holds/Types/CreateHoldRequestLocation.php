<?php

namespace Coss\Scheduling\Holds\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * One of the event type's `locations`, with your link filled in if it has none.
 */
class CreateHoldRequestLocation extends JsonSerializableType
{
    /**
     * @var (
     *    'link'
     *   |'phone'
     *   |'in_person'
     *   |'google_meet'
     *   |'microsoft_teams'
     *   |'zoom'
     *   |'_unknown'
     * ) $type
     */
    public readonly string $type;

    /**
     * @var (
     *    CreateHoldRequestLocationLink
     *   |CreateHoldRequestLocationPhone
     *   |CreateHoldRequestLocationInPerson
     *   |CreateHoldRequestLocationGoogleMeet
     *   |CreateHoldRequestLocationMicrosoftTeams
     *   |CreateHoldRequestLocationZoom
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
     *   |'google_meet'
     *   |'microsoft_teams'
     *   |'zoom'
     *   |'_unknown'
     * ),
     *   value: (
     *    CreateHoldRequestLocationLink
     *   |CreateHoldRequestLocationPhone
     *   |CreateHoldRequestLocationInPerson
     *   |CreateHoldRequestLocationGoogleMeet
     *   |CreateHoldRequestLocationMicrosoftTeams
     *   |CreateHoldRequestLocationZoom
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
     * @param CreateHoldRequestLocationLink $link
     * @return CreateHoldRequestLocation
     */
    public static function link(CreateHoldRequestLocationLink $link): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'link',
            'value' => $link,
        ]);
    }

    /**
     * @param CreateHoldRequestLocationPhone $phone
     * @return CreateHoldRequestLocation
     */
    public static function phone(CreateHoldRequestLocationPhone $phone): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'phone',
            'value' => $phone,
        ]);
    }

    /**
     * @param CreateHoldRequestLocationInPerson $inPerson
     * @return CreateHoldRequestLocation
     */
    public static function inPerson(CreateHoldRequestLocationInPerson $inPerson): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'in_person',
            'value' => $inPerson,
        ]);
    }

    /**
     * @param CreateHoldRequestLocationGoogleMeet $googleMeet
     * @return CreateHoldRequestLocation
     */
    public static function googleMeet(CreateHoldRequestLocationGoogleMeet $googleMeet): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'google_meet',
            'value' => $googleMeet,
        ]);
    }

    /**
     * @param CreateHoldRequestLocationMicrosoftTeams $microsoftTeams
     * @return CreateHoldRequestLocation
     */
    public static function microsoftTeams(CreateHoldRequestLocationMicrosoftTeams $microsoftTeams): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'microsoft_teams',
            'value' => $microsoftTeams,
        ]);
    }

    /**
     * @param CreateHoldRequestLocationZoom $zoom
     * @return CreateHoldRequestLocation
     */
    public static function zoom(CreateHoldRequestLocationZoom $zoom): CreateHoldRequestLocation
    {
        return new CreateHoldRequestLocation([
            'type' => 'zoom',
            'value' => $zoom,
        ]);
    }

    /**
     * @return bool
     */
    public function isLink(): bool
    {
        return $this->value instanceof CreateHoldRequestLocationLink && $this->type === 'link';
    }

    /**
     * @return CreateHoldRequestLocationLink
     */
    public function asLink(): CreateHoldRequestLocationLink
    {
        if (!($this->value instanceof CreateHoldRequestLocationLink && $this->type === 'link')) {
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
        return $this->value instanceof CreateHoldRequestLocationPhone && $this->type === 'phone';
    }

    /**
     * @return CreateHoldRequestLocationPhone
     */
    public function asPhone(): CreateHoldRequestLocationPhone
    {
        if (!($this->value instanceof CreateHoldRequestLocationPhone && $this->type === 'phone')) {
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
        return $this->value instanceof CreateHoldRequestLocationInPerson && $this->type === 'in_person';
    }

    /**
     * @return CreateHoldRequestLocationInPerson
     */
    public function asInPerson(): CreateHoldRequestLocationInPerson
    {
        if (!($this->value instanceof CreateHoldRequestLocationInPerson && $this->type === 'in_person')) {
            throw new Exception(
                "Expected in_person; got " . $this->type . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isGoogleMeet(): bool
    {
        return $this->value instanceof CreateHoldRequestLocationGoogleMeet && $this->type === 'google_meet';
    }

    /**
     * @return CreateHoldRequestLocationGoogleMeet
     */
    public function asGoogleMeet(): CreateHoldRequestLocationGoogleMeet
    {
        if (!($this->value instanceof CreateHoldRequestLocationGoogleMeet && $this->type === 'google_meet')) {
            throw new Exception(
                "Expected google_meet; got " . $this->type . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isMicrosoftTeams(): bool
    {
        return $this->value instanceof CreateHoldRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams';
    }

    /**
     * @return CreateHoldRequestLocationMicrosoftTeams
     */
    public function asMicrosoftTeams(): CreateHoldRequestLocationMicrosoftTeams
    {
        if (!($this->value instanceof CreateHoldRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams')) {
            throw new Exception(
                "Expected microsoft_teams; got " . $this->type . " with value of type " . get_debug_type($this->value),
            );
        }

        return $this->value;
    }

    /**
     * @return bool
     */
    public function isZoom(): bool
    {
        return $this->value instanceof CreateHoldRequestLocationZoom && $this->type === 'zoom';
    }

    /**
     * @return CreateHoldRequestLocationZoom
     */
    public function asZoom(): CreateHoldRequestLocationZoom
    {
        if (!($this->value instanceof CreateHoldRequestLocationZoom && $this->type === 'zoom')) {
            throw new Exception(
                "Expected zoom; got " . $this->type . " with value of type " . get_debug_type($this->value),
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
            case 'google_meet':
                $value = $this->asGoogleMeet()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'microsoft_teams':
                $value = $this->asMicrosoftTeams()->jsonSerialize();
                $result = array_merge($value, $result);
                break;
            case 'zoom':
                $value = $this->asZoom()->jsonSerialize();
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
                $args['value'] = CreateHoldRequestLocationLink::jsonDeserialize($data);
                break;
            case 'phone':
                $args['value'] = CreateHoldRequestLocationPhone::jsonDeserialize($data);
                break;
            case 'in_person':
                $args['value'] = CreateHoldRequestLocationInPerson::jsonDeserialize($data);
                break;
            case 'google_meet':
                $args['value'] = CreateHoldRequestLocationGoogleMeet::jsonDeserialize($data);
                break;
            case 'microsoft_teams':
                $args['value'] = CreateHoldRequestLocationMicrosoftTeams::jsonDeserialize($data);
                break;
            case 'zoom':
                $args['value'] = CreateHoldRequestLocationZoom::jsonDeserialize($data);
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
