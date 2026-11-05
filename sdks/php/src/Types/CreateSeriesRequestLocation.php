<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * One of the event type's `locations`, with your link filled in if it has none.
 */
class CreateSeriesRequestLocation extends JsonSerializableType
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
     *    CreateSeriesRequestLocationLink
     *   |CreateSeriesRequestLocationPhone
     *   |CreateSeriesRequestLocationInPerson
     *   |CreateSeriesRequestLocationGoogleMeet
     *   |CreateSeriesRequestLocationMicrosoftTeams
     *   |CreateSeriesRequestLocationZoom
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
     *    CreateSeriesRequestLocationLink
     *   |CreateSeriesRequestLocationPhone
     *   |CreateSeriesRequestLocationInPerson
     *   |CreateSeriesRequestLocationGoogleMeet
     *   |CreateSeriesRequestLocationMicrosoftTeams
     *   |CreateSeriesRequestLocationZoom
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
     * @param CreateSeriesRequestLocationLink $link
     * @return CreateSeriesRequestLocation
     */
    public static function link(CreateSeriesRequestLocationLink $link): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'link',
            'value' => $link,
        ]);
    }

    /**
     * @param CreateSeriesRequestLocationPhone $phone
     * @return CreateSeriesRequestLocation
     */
    public static function phone(CreateSeriesRequestLocationPhone $phone): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'phone',
            'value' => $phone,
        ]);
    }

    /**
     * @param CreateSeriesRequestLocationInPerson $inPerson
     * @return CreateSeriesRequestLocation
     */
    public static function inPerson(CreateSeriesRequestLocationInPerson $inPerson): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'in_person',
            'value' => $inPerson,
        ]);
    }

    /**
     * @param CreateSeriesRequestLocationGoogleMeet $googleMeet
     * @return CreateSeriesRequestLocation
     */
    public static function googleMeet(CreateSeriesRequestLocationGoogleMeet $googleMeet): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'google_meet',
            'value' => $googleMeet,
        ]);
    }

    /**
     * @param CreateSeriesRequestLocationMicrosoftTeams $microsoftTeams
     * @return CreateSeriesRequestLocation
     */
    public static function microsoftTeams(CreateSeriesRequestLocationMicrosoftTeams $microsoftTeams): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'microsoft_teams',
            'value' => $microsoftTeams,
        ]);
    }

    /**
     * @param CreateSeriesRequestLocationZoom $zoom
     * @return CreateSeriesRequestLocation
     */
    public static function zoom(CreateSeriesRequestLocationZoom $zoom): CreateSeriesRequestLocation
    {
        return new CreateSeriesRequestLocation([
            'type' => 'zoom',
            'value' => $zoom,
        ]);
    }

    /**
     * @return bool
     */
    public function isLink(): bool
    {
        return $this->value instanceof CreateSeriesRequestLocationLink && $this->type === 'link';
    }

    /**
     * @return CreateSeriesRequestLocationLink
     */
    public function asLink(): CreateSeriesRequestLocationLink
    {
        if (!($this->value instanceof CreateSeriesRequestLocationLink && $this->type === 'link')) {
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
        return $this->value instanceof CreateSeriesRequestLocationPhone && $this->type === 'phone';
    }

    /**
     * @return CreateSeriesRequestLocationPhone
     */
    public function asPhone(): CreateSeriesRequestLocationPhone
    {
        if (!($this->value instanceof CreateSeriesRequestLocationPhone && $this->type === 'phone')) {
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
        return $this->value instanceof CreateSeriesRequestLocationInPerson && $this->type === 'in_person';
    }

    /**
     * @return CreateSeriesRequestLocationInPerson
     */
    public function asInPerson(): CreateSeriesRequestLocationInPerson
    {
        if (!($this->value instanceof CreateSeriesRequestLocationInPerson && $this->type === 'in_person')) {
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
        return $this->value instanceof CreateSeriesRequestLocationGoogleMeet && $this->type === 'google_meet';
    }

    /**
     * @return CreateSeriesRequestLocationGoogleMeet
     */
    public function asGoogleMeet(): CreateSeriesRequestLocationGoogleMeet
    {
        if (!($this->value instanceof CreateSeriesRequestLocationGoogleMeet && $this->type === 'google_meet')) {
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
        return $this->value instanceof CreateSeriesRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams';
    }

    /**
     * @return CreateSeriesRequestLocationMicrosoftTeams
     */
    public function asMicrosoftTeams(): CreateSeriesRequestLocationMicrosoftTeams
    {
        if (!($this->value instanceof CreateSeriesRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams')) {
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
        return $this->value instanceof CreateSeriesRequestLocationZoom && $this->type === 'zoom';
    }

    /**
     * @return CreateSeriesRequestLocationZoom
     */
    public function asZoom(): CreateSeriesRequestLocationZoom
    {
        if (!($this->value instanceof CreateSeriesRequestLocationZoom && $this->type === 'zoom')) {
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
                $args['value'] = CreateSeriesRequestLocationLink::jsonDeserialize($data);
                break;
            case 'phone':
                $args['value'] = CreateSeriesRequestLocationPhone::jsonDeserialize($data);
                break;
            case 'in_person':
                $args['value'] = CreateSeriesRequestLocationInPerson::jsonDeserialize($data);
                break;
            case 'google_meet':
                $args['value'] = CreateSeriesRequestLocationGoogleMeet::jsonDeserialize($data);
                break;
            case 'microsoft_teams':
                $args['value'] = CreateSeriesRequestLocationMicrosoftTeams::jsonDeserialize($data);
                break;
            case 'zoom':
                $args['value'] = CreateSeriesRequestLocationZoom::jsonDeserialize($data);
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
