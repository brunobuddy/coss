<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Only for `email.suppressed`: the entry that matched the recipient.
 */
class EmailWebhookEventDataSuppression extends JsonSerializableType
{
    /**
     * @var string $id The suppression's id.
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var string $scope What it covers: every email, every marketing email, or one category.
     */
    #[JsonProperty('scope')]
    public string $scope;

    /**
     * @var value-of<EmailWebhookEventDataSuppressionReason> $reason `bounce`: added after a permanent bounce. `complaint`: added after a spam complaint. `manual`: added one by one through the API or dashboard. `import`: added by a bulk import. `unsubscribe`: added by the recipient's one-click unsubscribe, scoped to the email's category.
     */
    #[JsonProperty('reason')]
    public string $reason;

    /**
     * @param array{
     *   id: string,
     *   scope: string,
     *   reason: value-of<EmailWebhookEventDataSuppressionReason>,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->id = $values['id'];
        $this->scope = $values['scope'];
        $this->reason = $values['reason'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
