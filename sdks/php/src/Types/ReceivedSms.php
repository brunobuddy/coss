<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class ReceivedSms extends JsonSerializableType
{
    /**
     * @var value-of<ReceivedSmsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $from Who sent it.
     */
    #[JsonProperty('from')]
    public string $from;

    /**
     * @var string $to Your number that received it.
     */
    #[JsonProperty('to')]
    public string $to;

    /**
     * @var string $body The text.
     */
    #[JsonProperty('body')]
    public string $body;

    /**
     * @var int $segments Segments the text took.
     */
    #[JsonProperty('segments')]
    public int $segments;

    /**
     * @var ?value-of<ReceivedSmsKeyword> $keyword `stop`: an opt-out (the sender is suppressed in every live environment), `start`: an opt-in again, `help`: a request for help. Twilio answers each.
     */
    #[JsonProperty('keyword')]
    public ?string $keyword;

    /**
     * @var bool $sandbox Whether it's a simulated message of a sandbox environment.
     */
    #[JsonProperty('sandbox')]
    public bool $sandbox;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @param array{
     *   object: value-of<ReceivedSmsObject>,
     *   id: string,
     *   from: string,
     *   to: string,
     *   body: string,
     *   segments: int,
     *   sandbox: bool,
     *   createdAt: DateTime,
     *   keyword?: ?value-of<ReceivedSmsKeyword>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->from = $values['from'];
        $this->to = $values['to'];
        $this->body = $values['body'];
        $this->segments = $values['segments'];
        $this->keyword = $values['keyword'] ?? null;
        if (array_key_exists('keyword', $values)) {
            $this->_setField('keyword');
        }
        $this->sandbox = $values['sandbox'];
        $this->createdAt = $values['createdAt'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
