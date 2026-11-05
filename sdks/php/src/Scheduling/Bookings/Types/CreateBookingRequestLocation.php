<?php

namespace Coss\Scheduling\Bookings\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * One of the event type's `locations`, with your link filled in if it has none.
 */
class CreateBookingRequestLocation extends JsonSerializableType
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
     *    CreateBookingRequestLocationLink
     *   |CreateBookingRequestLocationPhone
     *   |CreateBookingRequestLocationInPerson
     *   |CreateBookingRequestLocationGoogleMeet
     *   |CreateBookingRequestLocationMicrosoftTeams
     *   |CreateBookingRequestLocationZoom
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
     *    CreateBookingRequestLocationLink
     *   |CreateBookingRequestLocationPhone
     *   |CreateBookingRequestLocationInPerson
     *   |CreateBookingRequestLocationGoogleMeet
     *   |CreateBookingRequestLocationMicrosoftTeams
     *   |CreateBookingRequestLocationZoom
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
     * @param CreateBookingRequestLocationLink $link
     * @return CreateBookingRequestLocation
     */
    public static function link(CreateBookingRequestLocationLink $link): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'link',
            'value' => $link,
        ]);
    }

    /**
     * @param CreateBookingRequestLocationPhone $phone
     * @return CreateBookingRequestLocation
     */
    public static function phone(CreateBookingRequestLocationPhone $phone): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'phone',
            'value' => $phone,
        ]);
    }

    /**
     * @param CreateBookingRequestLocationInPerson $inPerson
     * @return CreateBookingRequestLocation
     */
    public static function inPerson(CreateBookingRequestLocationInPerson $inPerson): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'in_person',
            'value' => $inPerson,
        ]);
    }

    /**
     * @param CreateBookingRequestLocationGoogleMeet $googleMeet
     * @return CreateBookingRequestLocation
     */
    public static function googleMeet(CreateBookingRequestLocationGoogleMeet $googleMeet): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'google_meet',
            'value' => $googleMeet,
        ]);
    }

    /**
     * @param CreateBookingRequestLocationMicrosoftTeams $microsoftTeams
     * @return CreateBookingRequestLocation
     */
    public static function microsoftTeams(CreateBookingRequestLocationMicrosoftTeams $microsoftTeams): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'microsoft_teams',
            'value' => $microsoftTeams,
        ]);
    }

    /**
     * @param CreateBookingRequestLocationZoom $zoom
     * @return CreateBookingRequestLocation
     */
    public static function zoom(CreateBookingRequestLocationZoom $zoom): CreateBookingRequestLocation
    {
        return new CreateBookingRequestLocation([
            'type' => 'zoom',
            'value' => $zoom,
        ]);
    }

    /**
     * @return bool
     */
    public function isLink(): bool
    {
        return $this->value instanceof CreateBookingRequestLocationLink && $this->type === 'link';
    }

    /**
     * @return CreateBookingRequestLocationLink
     */
    public function asLink(): CreateBookingRequestLocationLink
    {
        if (!($this->value instanceof CreateBookingRequestLocationLink && $this->type === 'link')) {
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
        return $this->value instanceof CreateBookingRequestLocationPhone && $this->type === 'phone';
    }

    /**
     * @return CreateBookingRequestLocationPhone
     */
    public function asPhone(): CreateBookingRequestLocationPhone
    {
        if (!($this->value instanceof CreateBookingRequestLocationPhone && $this->type === 'phone')) {
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
        return $this->value instanceof CreateBookingRequestLocationInPerson && $this->type === 'in_person';
    }

    /**
     * @return CreateBookingRequestLocationInPerson
     */
    public function asInPerson(): CreateBookingRequestLocationInPerson
    {
        if (!($this->value instanceof CreateBookingRequestLocationInPerson && $this->type === 'in_person')) {
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
        return $this->value instanceof CreateBookingRequestLocationGoogleMeet && $this->type === 'google_meet';
    }

    /**
     * @return CreateBookingRequestLocationGoogleMeet
     */
    public function asGoogleMeet(): CreateBookingRequestLocationGoogleMeet
    {
        if (!($this->value instanceof CreateBookingRequestLocationGoogleMeet && $this->type === 'google_meet')) {
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
        return $this->value instanceof CreateBookingRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams';
    }

    /**
     * @return CreateBookingRequestLocationMicrosoftTeams
     */
    public function asMicrosoftTeams(): CreateBookingRequestLocationMicrosoftTeams
    {
        if (!($this->value instanceof CreateBookingRequestLocationMicrosoftTeams && $this->type === 'microsoft_teams')) {
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
        return $this->value instanceof CreateBookingRequestLocationZoom && $this->type === 'zoom';
    }

    /**
     * @return CreateBookingRequestLocationZoom
     */
    public function asZoom(): CreateBookingRequestLocationZoom
    {
        if (!($this->value instanceof CreateBookingRequestLocationZoom && $this->type === 'zoom')) {
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
                $args['value'] = CreateBookingRequestLocationLink::jsonDeserialize($data);
                break;
            case 'phone':
                $args['value'] = CreateBookingRequestLocationPhone::jsonDeserialize($data);
                break;
            case 'in_person':
                $args['value'] = CreateBookingRequestLocationInPerson::jsonDeserialize($data);
                break;
            case 'google_meet':
                $args['value'] = CreateBookingRequestLocationGoogleMeet::jsonDeserialize($data);
                break;
            case 'microsoft_teams':
                $args['value'] = CreateBookingRequestLocationMicrosoftTeams::jsonDeserialize($data);
                break;
            case 'zoom':
                $args['value'] = CreateBookingRequestLocationZoom::jsonDeserialize($data);
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
