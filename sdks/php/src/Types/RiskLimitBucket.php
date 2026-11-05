<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class RiskLimitBucket extends JsonSerializableType
{
    /**
     * @var value-of<RiskLimitBucketObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $name What `POST /v1/risk/limits` names it by.
     */
    #[JsonProperty('name')]
    public string $name;

    /**
     * @var int $limit Tokens added per `period_seconds`.
     */
    #[JsonProperty('limit')]
    public int $limit;

    /**
     * @var int $periodSeconds How many seconds `limit` tokens take to be added.
     */
    #[JsonProperty('period_seconds')]
    public int $periodSeconds;

    /**
     * @var int $burst The bucket's size: how many requests a key can make at once.
     */
    #[JsonProperty('burst')]
    public int $burst;

    /**
     * @var value-of<RiskLimitBucketOnFailure> $onFailure The answer while coss.com can't count (its store is unavailable): `allow` (fail open) or `deny`.
     */
    #[JsonProperty('on_failure')]
    public string $onFailure;

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
     *   object: value-of<RiskLimitBucketObject>,
     *   id: string,
     *   name: string,
     *   limit: int,
     *   periodSeconds: int,
     *   burst: int,
     *   onFailure: value-of<RiskLimitBucketOnFailure>,
     *   createdAt: DateTime,
     *   updatedAt: DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->name = $values['name'];
        $this->limit = $values['limit'];
        $this->periodSeconds = $values['periodSeconds'];
        $this->burst = $values['burst'];
        $this->onFailure = $values['onFailure'];
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
