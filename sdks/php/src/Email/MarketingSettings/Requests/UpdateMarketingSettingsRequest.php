<?php

namespace Coss\Email\MarketingSettings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class UpdateMarketingSettingsRequest extends JsonSerializableType
{
    /**
     * @var ?string $displayName The sender's name in the preference center. `null`: the organization's.
     */
    #[JsonProperty('display_name')]
    public ?string $displayName;

    /**
     * @var ?string $mailingAddress The postal address every marketing email carries (CAN-SPAM). Marketing emails can't be sent without one.
     */
    #[JsonProperty('mailing_address')]
    public ?string $mailingAddress;

    /**
     * @var ?bool $doubleOptInDefault Whether contacts upserted without `double_opt_in` must confirm first.
     */
    #[JsonProperty('double_opt_in_default')]
    public ?bool $doubleOptInDefault;

    /**
     * @var ?string $confirmationFrom The sender of confirmation emails (a verified domain's address for live keys).
     */
    #[JsonProperty('confirmation_from')]
    public ?string $confirmationFrom;

    /**
     * @var ?string $confirmationSubject `null`: coss.com's default.
     */
    #[JsonProperty('confirmation_subject')]
    public ?string $confirmationSubject;

    /**
     * @var ?string $confirmationHtml `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
     */
    #[JsonProperty('confirmation_html')]
    public ?string $confirmationHtml;

    /**
     * @var ?string $confirmationText `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
     */
    #[JsonProperty('confirmation_text')]
    public ?string $confirmationText;

    /**
     * @var ?string $confirmedRedirectUrl Where a confirmed contact is sent, an https URL. `null`: coss.com's own page.
     */
    #[JsonProperty('confirmed_redirect_url')]
    public ?string $confirmedRedirectUrl;

    /**
     * @param array{
     *   displayName?: ?string,
     *   mailingAddress?: ?string,
     *   doubleOptInDefault?: ?bool,
     *   confirmationFrom?: ?string,
     *   confirmationSubject?: ?string,
     *   confirmationHtml?: ?string,
     *   confirmationText?: ?string,
     *   confirmedRedirectUrl?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->displayName = $values['displayName'] ?? null;
        if (array_key_exists('displayName', $values)) {
            $this->_setField('displayName');
        }
        $this->mailingAddress = $values['mailingAddress'] ?? null;
        if (array_key_exists('mailingAddress', $values)) {
            $this->_setField('mailingAddress');
        }
        $this->doubleOptInDefault = $values['doubleOptInDefault'] ?? null;
        if (array_key_exists('doubleOptInDefault', $values)) {
            $this->_setField('doubleOptInDefault');
        }
        $this->confirmationFrom = $values['confirmationFrom'] ?? null;
        if (array_key_exists('confirmationFrom', $values)) {
            $this->_setField('confirmationFrom');
        }
        $this->confirmationSubject = $values['confirmationSubject'] ?? null;
        if (array_key_exists('confirmationSubject', $values)) {
            $this->_setField('confirmationSubject');
        }
        $this->confirmationHtml = $values['confirmationHtml'] ?? null;
        if (array_key_exists('confirmationHtml', $values)) {
            $this->_setField('confirmationHtml');
        }
        $this->confirmationText = $values['confirmationText'] ?? null;
        if (array_key_exists('confirmationText', $values)) {
            $this->_setField('confirmationText');
        }
        $this->confirmedRedirectUrl = $values['confirmedRedirectUrl'] ?? null;
        if (array_key_exists('confirmedRedirectUrl', $values)) {
            $this->_setField('confirmedRedirectUrl');
        }
    }
}
