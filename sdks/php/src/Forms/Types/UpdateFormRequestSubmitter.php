<?php

namespace Coss\Forms\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Who the submitter is, and whether they must confirm by email. Only the fields given change.
 */
class UpdateFormRequestSubmitter extends JsonSerializableType
{
    /**
     * @var ?string $emailField The field holding the submitter's email address (Risk checks it, notifications reply to it, contacts are made from it). Default `email`.
     */
    #[JsonProperty('email_field')]
    public ?string $emailField;

    /**
     * @var ?bool $verify Hold every submission until the submitter clicks the link emailed to them (double opt-in for the whole submission). Default false.
     */
    #[JsonProperty('verify')]
    public ?bool $verify;

    /**
     * @var ?string $confirmationFrom The verification email's sender: an address on a verified domain (required with `verify` in live environments).
     */
    #[JsonProperty('confirmation_from')]
    public ?string $confirmationFrom;

    /**
     * @param array{
     *   emailField?: ?string,
     *   verify?: ?bool,
     *   confirmationFrom?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->emailField = $values['emailField'] ?? null;
        if (array_key_exists('emailField', $values)) {
            $this->_setField('emailField');
        }
        $this->verify = $values['verify'] ?? null;
        if (array_key_exists('verify', $values)) {
            $this->_setField('verify');
        }
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
