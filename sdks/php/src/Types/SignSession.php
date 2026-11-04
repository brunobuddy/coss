<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class SignSession extends JsonSerializableType
{
    /**
     * @var value-of<SignSessionObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $requestId The signature request's id.
     */
    #[JsonProperty('request_id')]
    public string $requestId;

    /**
     * @var string $signerId The signer's id.
     */
    #[JsonProperty('signer_id')]
    public string $signerId;

    /**
     * @var string $url The signing page: embed it in an iframe (from an allowed origin, with `coss/sign`'s `mountSigning`) or redirect to it. The token is in the URL fragment, so it never reaches a server log: show it only to that signer.
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
     *   object: value-of<SignSessionObject>,
     *   id: string,
     *   requestId: string,
     *   signerId: string,
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
        $this->requestId = $values['requestId'];
        $this->signerId = $values['signerId'];
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
