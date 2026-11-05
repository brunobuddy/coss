<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class SchedulingSession extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSessionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $token Shown only now. A bearer token for the client API.
     */
    #[JsonProperty('token')]
    public string $token;

    /**
     * @var ?string $url coss.com's hosted page, with the token in its fragment.
     */
    #[JsonProperty('url')]
    public ?string $url;

    /**
     * @var string $expiresAt
     */
    #[JsonProperty('expires_at')]
    public string $expiresAt;

    /**
     * @param array{
     *   object: value-of<SchedulingSessionObject>,
     *   id: string,
     *   token: string,
     *   expiresAt: string,
     *   url?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->token = $values['token'];
        $this->url = $values['url'] ?? null;
        if (array_key_exists('url', $values)) {
            $this->_setField('url');
        }
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
