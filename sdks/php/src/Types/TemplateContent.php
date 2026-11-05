<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class TemplateContent extends JsonSerializableType
{
    /**
     * @var string $locale The BCP 47 language tag this content is for.
     */
    #[JsonProperty('locale')]
    public string $locale;

    /**
     * @var string $subject The subject template.
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $html The HTML template. `null`: text only.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The plain-text template. `null`: HTML only.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @param array{
     *   locale: string,
     *   subject: string,
     *   html?: ?string,
     *   text?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->locale = $values['locale'];
        $this->subject = $values['subject'];
        $this->html = $values['html'] ?? null;
        if (array_key_exists('html', $values)) {
            $this->_setField('html');
        }
        $this->text = $values['text'] ?? null;
        if (array_key_exists('text', $values)) {
            $this->_setField('text');
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
