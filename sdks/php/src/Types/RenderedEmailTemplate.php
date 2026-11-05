<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class RenderedEmailTemplate extends JsonSerializableType
{
    /**
     * @var value-of<RenderedEmailTemplateObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $templateId The template's id.
     */
    #[JsonProperty('template_id')]
    public string $templateId;

    /**
     * @var ?int $version The version rendered; `null` for the draft.
     */
    #[JsonProperty('version')]
    public ?int $version;

    /**
     * @var string $locale The locale rendered.
     */
    #[JsonProperty('locale')]
    public string $locale;

    /**
     * @var string $subject The rendered subject.
     */
    #[JsonProperty('subject')]
    public string $subject;

    /**
     * @var ?string $html The rendered HTML. `null`: the template has none.
     */
    #[JsonProperty('html')]
    public ?string $html;

    /**
     * @var ?string $text The rendered plain text. `null`: the template has none.
     */
    #[JsonProperty('text')]
    public ?string $text;

    /**
     * @param array{
     *   object: value-of<RenderedEmailTemplateObject>,
     *   templateId: string,
     *   locale: string,
     *   subject: string,
     *   version?: ?int,
     *   html?: ?string,
     *   text?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->templateId = $values['templateId'];
        $this->version = $values['version'] ?? null;
        if (array_key_exists('version', $values)) {
            $this->_setField('version');
        }
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
