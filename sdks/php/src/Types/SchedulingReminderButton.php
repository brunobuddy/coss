<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * One button in the email. `null`: none.
 */
class SchedulingReminderButton extends JsonSerializableType
{
    /**
     * @var string $label What the button says.
     */
    #[JsonProperty('label')]
    public string $label;

    /**
     * @var string $url Where it goes.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @param array{
     *   label: string,
     *   url: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->label = $values['label'];
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
