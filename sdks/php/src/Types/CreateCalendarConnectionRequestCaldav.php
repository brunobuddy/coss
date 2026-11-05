<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class CreateCalendarConnectionRequestCaldav extends JsonSerializableType
{
    /**
     * @var string $url The server's https URL.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var string $username The account's username on that server.
     */
    #[JsonProperty('username')]
    public string $username;

    /**
     * @var string $password An app-specific password. Encrypted, and never returned.
     */
    #[JsonProperty('password')]
    public string $password;

    /**
     * @param array{
     *   url: string,
     *   username: string,
     *   password: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->url = $values['url'];
        $this->username = $values['username'];
        $this->password = $values['password'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
