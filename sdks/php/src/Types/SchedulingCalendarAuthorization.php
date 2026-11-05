<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingCalendarAuthorization extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingCalendarAuthorizationObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $url Open it in a new window: providers refuse to be framed.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @param array{
     *   object: value-of<SchedulingCalendarAuthorizationObject>,
     *   url: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->url = $values['url'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
