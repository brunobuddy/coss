<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * One button in the email. Needs `email_from`.
 */
class SchedulingReminderInputButton extends JsonSerializableType
{
    /**
     * @var string $label
     */
    #[JsonProperty('label')]
    public string $label;

    /**
     * @var string $url https, on one of your verified domains (live environments). May use `{{booking_id}}` in its path or query.
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
