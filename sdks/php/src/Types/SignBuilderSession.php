<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SignBuilderSession extends JsonSerializableType
{
    /**
     * @var value-of<SignBuilderSessionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $templateId The id of the template it edits.
     */
    #[JsonProperty('template_id')]
    public string $templateId;

    /**
     * @var string $url The builder: embed it (from an allowed origin, `mountBuilder` from `coss/sign`) for whoever edits the template: they can upload documents, add roles and place fields. Show it only to them.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var string $token The secret part of `url`, shown only here.
     */
    #[JsonProperty('token')]
    public string $token;

    /**
     * @var DateTime $expiresAt When the link stops working.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $expiresAt;

    /**
     * @param array{
     *   object: value-of<SignBuilderSessionObject>,
     *   id: string,
     *   templateId: string,
     *   url: string,
     *   token: string,
     *   expiresAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->templateId = $values['templateId'];
        $this->url = $values['url'];
        $this->token = $values['token'];
        $this->expiresAt = $values['expiresAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
