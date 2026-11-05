<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class EmailWebhookEventDataComplaint extends JsonSerializableType
{
    /**
     * @var ?string $feedbackType The kind of complaint the mailbox provider reported. `null`: not reported.
     */
    #[JsonProperty('feedback_type')]
    public ?string $feedbackType;

    /**
     * @var ?string $subType The provider's finer classification. `null`: not reported.
     */
    #[JsonProperty('sub_type')]
    public ?string $subType;

    /**
     * @param array{
     *   feedbackType?: ?string,
     *   subType?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->feedbackType = $values['feedbackType'] ?? null;
        if (array_key_exists('feedbackType', $values)) {
            $this->_setField('feedbackType');
        }
        $this->subType = $values['subType'] ?? null;
        if (array_key_exists('subType', $values)) {
            $this->_setField('subType');
        }
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
