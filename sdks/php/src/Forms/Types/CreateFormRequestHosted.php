<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * The page coss.com can serve for this form. Only the fields given change.
 */
class CreateFormRequestHosted extends JsonSerializableType
{
    /**
     * @var ?bool $enabled Serve the form as a page at its `hosted_url` (needs `fields`). Default false.
     */
    #[JsonProperty('enabled')]
    public ?bool $enabled;

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
     * @param array{
     *   enabled?: ?bool,
     *   title?: ?string,
     *   description?: ?string,
     *   submitLabel?: ?string,
     *   successMessage?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->enabled = $values['enabled'] ?? null;
        if (array_key_exists('enabled', $values)) {
            $this->_setField('enabled');
        }
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
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
