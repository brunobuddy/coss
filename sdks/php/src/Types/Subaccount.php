<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use DateTime;
use Coss\Core\Types\Date;

class Subaccount extends JsonSerializableType
{
    /**
     * @var value-of<SubaccountObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var ?string $uid Your own id for it (e.g. your user's id), unique in the environment. Every path and send that takes a sub-account accepts its `id` or its `uid`.
     */
    #[JsonProperty('uid')]
    public ?string $uid;

    /**
     * @var string $name Your name for it.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var array<string, string> $metadata Your own key-value pairs.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'string'])]
    public array $metadata;

    /**
     * @var value-of<SubaccountStatus> $status `disabled`: you turned it off (its sends are refused). `deleting`: its domains are being released.
     */
    #[JsonProperty('status')]
    public string $status;

    /**
     * @var SubaccountQuotas $quotas
     */
    #[JsonProperty('quotas')]
    public SubaccountQuotas $quotas;

    /**
     * @var SubaccountReputation $reputation
     */
    #[JsonProperty('reputation')]
    public SubaccountReputation $reputation;

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
     *   object: value-of<SubaccountObject>,
     *   id: string,
     *   name: string,
     *   metadata: array<string, string>,
     *   status: value-of<SubaccountStatus>,
     *   quotas: SubaccountQuotas,
     *   reputation: SubaccountReputation,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     *   uid?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->uid = $values['uid'] ?? null;
        if (array_key_exists('uid', $values)) {
            $this->_setField('uid');
        }
        $this->name = $values['name'];
        $this->metadata = $values['metadata'];
        $this->status = $values['status'];
        $this->quotas = $values['quotas'];
        $this->reputation = $values['reputation'];
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
