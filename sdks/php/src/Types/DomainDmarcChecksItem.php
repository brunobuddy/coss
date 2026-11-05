<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class DomainDmarcChecksItem extends JsonSerializableType
{
    /**
     * @var value-of<DomainDmarcChecksItemId> $id Which check this is.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var bool $ok Whether it passes.
     */
    #[JsonProperty('ok')]
    public bool $ok;

    /**
     * @var string $message What it found.
     */
    #[JsonProperty('message')]
    public string $message;

    /**
     * @param array{
     *   id: value-of<DomainDmarcChecksItemId>,
     *   ok: bool,
     *   message: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->ok = $values['ok'];
        $this->message = $values['message'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
