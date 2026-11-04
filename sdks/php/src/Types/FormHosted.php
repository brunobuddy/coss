<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * The page coss.com can serve for this form.
 */
class FormHosted extends JsonSerializableType
{
    /**
     * @var bool $enabled Whether the page is served at `hosted_url`.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var ?string $title The page's heading. `null`: the form's name.
     */
    #[JsonProperty('title')]
    public ?string $title;

    /**
     * @var ?string $description Text under the heading. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?string $submitLabel The submit button's label. `null`: the default.
     */
    #[JsonProperty('submit_label')]
    public ?string $submitLabel;

    /**
     * @var ?string $successMessage Shown after a submission. `null`: the default.
     */
    #[JsonProperty('success_message')]
    public ?string $successMessage;

    /**
     * @var ?DateTime $publishedAt When the page was turned on, or what it shows last changed. `null`: never published.
     */
    #[JsonProperty('published_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $publishedAt;

    /**
     * @param array{
     *   enabled: bool,
     *   title?: ?string,
     *   description?: ?string,
     *   submitLabel?: ?string,
     *   successMessage?: ?string,
     *   publishedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->enabled = $values['enabled'];
        $this->title = $values['title'] ?? null;
        if (array_key_exists('title', $values)) {
            $this->_setField('title');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->submitLabel = $values['submitLabel'] ?? null;
        if (array_key_exists('submitLabel', $values)) {
            $this->_setField('submitLabel');
        }
        $this->successMessage = $values['successMessage'] ?? null;
        if (array_key_exists('successMessage', $values)) {
            $this->_setField('successMessage');
        }
        $this->publishedAt = $values['publishedAt'] ?? null;
        if (array_key_exists('publishedAt', $values)) {
            $this->_setField('publishedAt');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
