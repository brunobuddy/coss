<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class HookPortalSession extends JsonSerializableType
{
    /**
     * @var value-of<HookPortalSessionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $applicationId The id of the application this session manages.
     */
    #[JsonProperty('application_id')]
    public string $applicationId;

    /**
     * @var string $url Open it or embed it in an iframe (from an allowed origin). The token is in the URL fragment, so it never reaches a server log: hand the URL only to that application's user.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var string $token The secret part of `url`, shown only here.
     */
    #[JsonProperty('token')]
    public string $token;

    /**
     * @var bool $readOnly Whether the user can only look.
     */
    #[JsonProperty('read_only')]
    public bool $readOnly;

    /**
     * @var DateTime $expiresAt When the session stops working.
     */
    #[JsonProperty('expires_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $expiresAt;

    /**
     * @param array{
     *   object: value-of<HookPortalSessionObject>,
     *   id: string,
     *   applicationId: string,
     *   url: string,
     *   token: string,
     *   readOnly: bool,
     *   expiresAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->applicationId = $values['applicationId'];
        $this->url = $values['url'];
        $this->token = $values['token'];
        $this->readOnly = $values['readOnly'];
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
