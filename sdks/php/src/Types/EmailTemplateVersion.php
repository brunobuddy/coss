<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class EmailTemplateVersion extends JsonSerializableType
{
    /**
     * @var value-of<EmailTemplateVersionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $templateId The template's id.
     */
    #[JsonProperty('template_id')]
    public string $templateId;

    /**
     * @var ?int $version The version number; `null` for the draft.
     */
    #[JsonProperty('version')]
    public ?int $version;

    /**
     * @var int $revision Counts the draft's saves. A published version keeps the revision it was published from.
     */
    #[JsonProperty('revision')]
    public int $revision;

    /**
     * @var string $defaultLocale The locale sends fall back to when they ask for none, or for one without content.
     */
    #[JsonProperty('default_locale')]
    public string $defaultLocale;

    /**
     * @var array<TemplateVariable> $variables The variables the template uses, with their types.
     */
    #[JsonProperty('variables'), ArrayType([TemplateVariable::class])]
    public array $variables;

    /**
     * @var array<string, mixed> $sampleVariables Example values for previews and test sends in the dashboard.
     */
    #[JsonProperty('sample_variables'), ArrayType(['string' => 'mixed'])]
    public array $sampleVariables;

    /**
     * @var array<TemplateContent> $contents The subject, HTML and text per locale.
     */
    #[JsonProperty('contents'), ArrayType([TemplateContent::class])]
    public array $contents;

    /**
     * @var array<TemplateProblem> $problems Syntax errors and undeclared variables per locale and field, which keep a draft from being published. Always empty for published versions.
     */
    #[JsonProperty('problems'), ArrayType([TemplateProblem::class])]
    public array $problems;

    /**
     * @var ?DateTime $publishedAt When this version was published. `null` for the draft.
     */
    #[JsonProperty('published_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $publishedAt;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var DateTime $updatedAt
     */
    #[JsonProperty('updated_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $updatedAt;

    /**
     * @param array{
     *   object: value-of<EmailTemplateVersionObject>,
     *   templateId: string,
     *   revision: int,
     *   defaultLocale: string,
     *   variables: array<TemplateVariable>,
     *   sampleVariables: array<string, mixed>,
     *   contents: array<TemplateContent>,
     *   problems: array<TemplateProblem>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   version?: ?int,
     *   publishedAt?: ?DateTime,
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
        $this->revision = $values['revision'];
        $this->defaultLocale = $values['defaultLocale'];
        $this->variables = $values['variables'];
        $this->sampleVariables = $values['sampleVariables'];
        $this->contents = $values['contents'];
        $this->problems = $values['problems'];
        $this->publishedAt = $values['publishedAt'] ?? null;
        if (array_key_exists('publishedAt', $values)) {
            $this->_setField('publishedAt');
        }
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
