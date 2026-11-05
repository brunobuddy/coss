<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class LogDrainWithSecret extends JsonSerializableType
{
    /**
     * @var value-of<LogDrainWithSecretObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $url Where batches are posted.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var ?string $description Your note about it. `null`: none.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var array<value-of<LogDrainSource>> $sources What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later.
     */
    #[JsonProperty('sources'), ArrayType(['string'])]
    public array $sources;

    /**
     * @var value-of<LogDrainFormat> $format
     */
    #[JsonProperty('format')]
    public string $format;

    /**
     * @var ?string $authHeaderName The header sent with every batch to authenticate it (e.g. `Authorization`, `DD-API-KEY`), or `null`. Its value is never returned.
     */
    #[JsonProperty('auth_header_name')]
    public ?string $authHeaderName;

    /**
     * @var bool $enabled A disabled drain receives nothing, and lines logged while it is disabled are not kept for it.
     */
    #[JsonProperty('enabled')]
    public bool $enabled;

    /**
     * @var ?value-of<LogDrainWithSecretDisabledReason> $disabledReason `manual`: someone disabled it. `failing`: a batch failed every attempt, so coss.com disabled it. `null` while enabled.
     */
    #[JsonProperty('disabled_reason')]
    public ?string $disabledReason;

    /**
     * @var ?DateTime $disabledAt When it was disabled. `null` while enabled.
     */
    #[JsonProperty('disabled_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $disabledAt;

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
     * @var string $secret The drain's `whsec_…` signing secret, used to verify the batches coss.com sends. Returned only when the drain is created — store it now; it cannot be read back through the API.
     */
    #[JsonProperty('secret')]
    public string $secret;

    /**
     * @param array{
     *   object: value-of<LogDrainWithSecretObject>,
     *   id: string,
     *   url: string,
     *   sources: array<value-of<LogDrainSource>>,
     *   format: value-of<LogDrainFormat>,
     *   enabled: bool,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   secret: string,
     *   description?: ?string,
     *   authHeaderName?: ?string,
     *   disabledReason?: ?value-of<LogDrainWithSecretDisabledReason>,
     *   disabledAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->url = $values['url'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->sources = $values['sources'];
        $this->format = $values['format'];
        $this->authHeaderName = $values['authHeaderName'] ?? null;
        if (array_key_exists('authHeaderName', $values)) {
            $this->_setField('authHeaderName');
        }
        $this->enabled = $values['enabled'];
        $this->disabledReason = $values['disabledReason'] ?? null;
        if (array_key_exists('disabledReason', $values)) {
            $this->_setField('disabledReason');
        }
        $this->disabledAt = $values['disabledAt'] ?? null;
        if (array_key_exists('disabledAt', $values)) {
            $this->_setField('disabledAt');
        }
        $this->createdAt = $values['createdAt'];
        $this->updatedAt = $values['updatedAt'];
        $this->secret = $values['secret'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
