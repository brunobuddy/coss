<?php

namespace Coss\Email\Templates\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\TemplateVariableInput;
use Coss\Core\Types\ArrayType;
use Coss\Types\TemplateContentInput;

class CreateEmailTemplateRequest extends JsonSerializableType
{
    /**
     * @var string $name Shown in the dashboard.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var ?string $alias A name to send the template by instead of its id, e.g. `welcome`: the same alias can be used in every environment.
     */
    #[JsonProperty('alias')]
    public ?string $alias;

    /**
     * @var ?string $description Your note about it, shown in the dashboard.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?string $defaultLocale The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
     */
    #[JsonProperty('default_locale')]
    public ?string $defaultLocale;

    /**
     * @var ?array<TemplateVariableInput> $variables The variables the template uses, with their types.
     */
    #[JsonProperty('variables'), ArrayType([TemplateVariableInput::class])]
    public ?array $variables;

    /**
     * @var ?array<string, mixed> $sampleVariables Example values for previews and test sends in the dashboard.
     */
    #[JsonProperty('sample_variables'), ArrayType(['string' => 'mixed'])]
    public ?array $sampleVariables;

    /**
     * @var ?array<TemplateContentInput> $contents The subject, HTML and text per locale.
     */
    #[JsonProperty('contents'), ArrayType([TemplateContentInput::class])]
    public ?array $contents;

    /**
     * @param array{
     *   name: string,
     *   alias?: ?string,
     *   description?: ?string,
     *   defaultLocale?: ?string,
     *   variables?: ?array<TemplateVariableInput>,
     *   sampleVariables?: ?array<string, mixed>,
     *   contents?: ?array<TemplateContentInput>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->name = $values['name'];
        $this->alias = $values['alias'] ?? null;
        if (array_key_exists('alias', $values)) {
            $this->_setField('alias');
        }
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->defaultLocale = $values['defaultLocale'] ?? null;
        if (array_key_exists('defaultLocale', $values)) {
            $this->_setField('defaultLocale');
        }
        $this->variables = $values['variables'] ?? null;
        if (array_key_exists('variables', $values)) {
            $this->_setField('variables');
        }
        $this->sampleVariables = $values['sampleVariables'] ?? null;
        if (array_key_exists('sampleVariables', $values)) {
            $this->_setField('sampleVariables');
        }
        $this->contents = $values['contents'] ?? null;
        if (array_key_exists('contents', $values)) {
            $this->_setField('contents');
        }
    }
}
