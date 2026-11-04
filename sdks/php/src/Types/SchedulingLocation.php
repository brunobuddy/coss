<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Exception;

/**
 * Where a booking meets. `link`, `phone` and `in_person` carry their details, and on an event type, left blank, use the booked host's own if they have one; `google_meet`, `microsoft_teams` and `zoom` get a meeting made on the host's connected account.
 */
class SchedulingLocation extends JsonSerializableType
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
     *    SchedulingLocationLink
     *   |SchedulingLocationPhone
     *   |SchedulingLocationInPerson
     *   |SchedulingLocationGoogleMeet
     *   |SchedulingLocationMicrosoftTeams
     *   |SchedulingLocationZoom
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
     *    SchedulingLocationLink
     *   |SchedulingLocationPhone
     *   |SchedulingLocationInPerson
     *   |SchedulingLocationGoogleMeet
     *   |SchedulingLocationMicrosoftTeams
     *   |SchedulingLocationZoom
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
     * @param SchedulingLocationLink $link
     * @return SchedulingLocation
     */
    public static function link(SchedulingLocationLink $link): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'link',
            'value' => $link,
        ]);
    }

    /**
     * @param SchedulingLocationPhone $phone
     * @return SchedulingLocation
     */
    public static function phone(SchedulingLocationPhone $phone): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'phone',
            'value' => $phone,
        ]);
    }

    /**
     * @param SchedulingLocationInPerson $inPerson
     * @return SchedulingLocation
     */
    public static function inPerson(SchedulingLocationInPerson $inPerson): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'in_person',
            'value' => $inPerson,
        ]);
    }

    /**
     * @param SchedulingLocationGoogleMeet $googleMeet
     * @return SchedulingLocation
     */
    public static function googleMeet(SchedulingLocationGoogleMeet $googleMeet): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'google_meet',
            'value' => $googleMeet,
        ]);
    }

    /**
     * @param SchedulingLocationMicrosoftTeams $microsoftTeams
     * @return SchedulingLocation
     */
    public static function microsoftTeams(SchedulingLocationMicrosoftTeams $microsoftTeams): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'microsoft_teams',
            'value' => $microsoftTeams,
        ]);
    }

    /**
     * @param SchedulingLocationZoom $zoom
     * @return SchedulingLocation
     */
    public static function zoom(SchedulingLocationZoom $zoom): SchedulingLocation
    {
        return new SchedulingLocation([
            'type' => 'zoom',
            'value' => $zoom,
        ]);
    }

    /**
     * @return bool
     */
    public function isLink(): bool
    {
        return $this->value instanceof SchedulingLocationLink && $this->type === 'link';
    }

    /**
     * @return SchedulingLocationLink
     */
    public function asLink(): SchedulingLocationLink
    {
        if (!($this->value instanceof SchedulingLocationLink && $this->type === 'link')) {
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
        return $this->value instanceof SchedulingLocationPhone && $this->type === 'phone';
    }

    /**
     * @return SchedulingLocationPhone
     */
    public function asPhone(): SchedulingLocationPhone
    {
        if (!($this->value instanceof SchedulingLocationPhone && $this->type === 'phone')) {
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
        return $this->value instanceof SchedulingLocationInPerson && $this->type === 'in_person';
    }

    /**
     * @return SchedulingLocationInPerson
     */
    public function asInPerson(): SchedulingLocationInPerson
    {
        if (!($this->value instanceof SchedulingLocationInPerson && $this->type === 'in_person')) {
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
        return $this->value instanceof SchedulingLocationGoogleMeet && $this->type === 'google_meet';
    }

    /**
     * @return SchedulingLocationGoogleMeet
     */
    public function asGoogleMeet(): SchedulingLocationGoogleMeet
    {
        if (!($this->value instanceof SchedulingLocationGoogleMeet && $this->type === 'google_meet')) {
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
        return $this->value instanceof SchedulingLocationMicrosoftTeams && $this->type === 'microsoft_teams';
    }

    /**
     * @return SchedulingLocationMicrosoftTeams
     */
    public function asMicrosoftTeams(): SchedulingLocationMicrosoftTeams
    {
        if (!($this->value instanceof SchedulingLocationMicrosoftTeams && $this->type === 'microsoft_teams')) {
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
        return $this->value instanceof SchedulingLocationZoom && $this->type === 'zoom';
    }

    /**
     * @return SchedulingLocationZoom
     */
    public function asZoom(): SchedulingLocationZoom
    {
        if (!($this->value instanceof SchedulingLocationZoom && $this->type === 'zoom')) {
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
                $args['value'] = SchedulingLocationLink::jsonDeserialize($data);
                break;
            case 'phone':
                $args['value'] = SchedulingLocationPhone::jsonDeserialize($data);
                break;
            case 'in_person':
                $args['value'] = SchedulingLocationInPerson::jsonDeserialize($data);
                break;
            case 'google_meet':
                $args['value'] = SchedulingLocationGoogleMeet::jsonDeserialize($data);
                break;
            case 'microsoft_teams':
                $args['value'] = SchedulingLocationMicrosoftTeams::jsonDeserialize($data);
                break;
            case 'zoom':
                $args['value'] = SchedulingLocationZoom::jsonDeserialize($data);
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
