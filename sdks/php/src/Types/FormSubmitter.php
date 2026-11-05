<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who the submitter is, and whether they must confirm by email.
 */
class FormSubmitter extends JsonSerializableType
{
    /**
     * @var string $emailField The field holding the submitter's email address.
     */
    #[JsonProperty('email_field')]
    public string $emailField;

    /**
     * @var bool $verify Whether submissions wait until the submitter clicks a link emailed to them.
     */
    #[JsonProperty('verify')]
    public bool $verify;

    /**
     * @var ?string $confirmationFrom The verification email's sender. `null`: none set.
     */
    #[JsonProperty('confirmation_from')]
    public ?string $confirmationFrom;

    /**
     * @param array{
     *   emailField: string,
     *   verify: bool,
     *   confirmationFrom?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->emailField = $values['emailField'];
        $this->verify = $values['verify'];
        $this->confirmationFrom = $values['confirmationFrom'] ?? null;
        if (array_key_exists('confirmationFrom', $values)) {
            $this->_setField('confirmationFrom');
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
