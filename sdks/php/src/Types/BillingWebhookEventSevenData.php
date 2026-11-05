<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

class BillingWebhookEventSevenData extends JsonSerializableType
{
    /**
     * @var string $organizationId The organization's id.
     */
    #[JsonProperty('organization_id')]
    public string $organizationId;

    /**
     * @var DateTime $occurredAt When it happened: sort events by it.
     */
    #[JsonProperty('occurred_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $occurredAt;

    /**
     * @var value-of<BillingWebhookEventSevenDataScope> $scope What the budget is for: a member's personal API keys (`user`), a project or an API key.
     */
    #[JsonProperty('scope')]
    public string $scope;

    /**
     * @var string $targetId The user, project or API key id.
     */
    #[JsonProperty('target_id')]
    public string $targetId;

    /**
     * @param array{
     *   organizationId: string,
     *   occurredAt: DateTime,
     *   scope: value-of<BillingWebhookEventSevenDataScope>,
     *   targetId: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->organizationId = $values['organizationId'];
        $this->occurredAt = $values['occurredAt'];
        $this->scope = $values['scope'];
        $this->targetId = $values['targetId'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
