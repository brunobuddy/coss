<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * Reasons whose weight this environment changed (from calibration or by hand); the rest weigh what the reason catalog says.
 */
class RiskSettingsReasonWeights extends JsonSerializableType
{
    /**
     * @var ?float $emailInvalid This reason's weight in this environment.
     */
    #[JsonProperty('email.invalid')]
    public ?float $emailInvalid;

    /**
     * @var ?float $emailDisposable This reason's weight in this environment.
     */
    #[JsonProperty('email.disposable')]
    public ?float $emailDisposable;

    /**
     * @var ?float $emailUndeliverable This reason's weight in this environment.
     */
    #[JsonProperty('email.undeliverable')]
    public ?float $emailUndeliverable;

    /**
     * @var ?float $emailRoleAccount This reason's weight in this environment.
     */
    #[JsonProperty('email.role_account')]
    public ?float $emailRoleAccount;

    /**
     * @var ?float $emailTypo This reason's weight in this environment.
     */
    #[JsonProperty('email.typo')]
    public ?float $emailTypo;

    /**
     * @var ?float $emailDomainNew This reason's weight in this environment.
     */
    #[JsonProperty('email.domain_new')]
    public ?float $emailDomainNew;

    /**
     * @var ?float $ipTor This reason's weight in this environment.
     */
    #[JsonProperty('ip.tor')]
    public ?float $ipTor;

    /**
     * @var ?float $ipVpnNetwork This reason's weight in this environment.
     */
    #[JsonProperty('ip.vpn_network')]
    public ?float $ipVpnNetwork;

    /**
     * @var ?float $ipHostingProvider This reason's weight in this environment.
     */
    #[JsonProperty('ip.hosting_provider')]
    public ?float $ipHostingProvider;

    /**
     * @var ?float $ipVpn This reason's weight in this environment.
     */
    #[JsonProperty('ip.vpn')]
    public ?float $ipVpn;

    /**
     * @var ?float $ipProxy This reason's weight in this environment.
     */
    #[JsonProperty('ip.proxy')]
    public ?float $ipProxy;

    /**
     * @var ?float $ipRelay This reason's weight in this environment.
     */
    #[JsonProperty('ip.relay')]
    public ?float $ipRelay;

    /**
     * @var ?float $ipPrivate This reason's weight in this environment.
     */
    #[JsonProperty('ip.private')]
    public ?float $ipPrivate;

    /**
     * @var ?float $velocitySignupsPerIp1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_ip_1h')]
    public ?float $velocitySignupsPerIp1H;

    /**
     * @var ?float $velocitySignupsPerIp24H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_ip_24h')]
    public ?float $velocitySignupsPerIp24H;

    /**
     * @var ?float $velocitySignupsPerSubnet1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_subnet_1h')]
    public ?float $velocitySignupsPerSubnet1H;

    /**
     * @var ?float $velocitySignupsPerEmailDomain1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_email_domain_1h')]
    public ?float $velocitySignupsPerEmailDomain1H;

    /**
     * @var ?float $velocitySignupsPerMailbox24H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_mailbox_24h')]
    public ?float $velocitySignupsPerMailbox24H;

    /**
     * @var ?float $velocitySignupsPerDevice24H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.signups_per_device_24h')]
    public ?float $velocitySignupsPerDevice24H;

    /**
     * @var ?float $velocityCheckoutsPerIp1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.checkouts_per_ip_1h')]
    public ?float $velocityCheckoutsPerIp1H;

    /**
     * @var ?float $velocityCheckoutsPerUser1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.checkouts_per_user_1h')]
    public ?float $velocityCheckoutsPerUser1H;

    /**
     * @var ?float $velocityCheckoutsPerCard24H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.checkouts_per_card_24h')]
    public ?float $velocityCheckoutsPerCard24H;

    /**
     * @var ?float $velocityLoginsPerIp1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.logins_per_ip_1h')]
    public ?float $velocityLoginsPerIp1H;

    /**
     * @var ?float $velocityLoginsPerUser1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.logins_per_user_1h')]
    public ?float $velocityLoginsPerUser1H;

    /**
     * @var ?float $velocityEventsPerIp1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.events_per_ip_1h')]
    public ?float $velocityEventsPerIp1H;

    /**
     * @var ?float $velocityEventsPerUser1H This reason's weight in this environment.
     */
    #[JsonProperty('velocity.events_per_user_1h')]
    public ?float $velocityEventsPerUser1H;

    /**
     * @var ?float $duplicateCanonicalMailbox This reason's weight in this environment.
     */
    #[JsonProperty('duplicate.canonical_mailbox')]
    public ?float $duplicateCanonicalMailbox;

    /**
     * @var ?float $duplicateDevice This reason's weight in this environment.
     */
    #[JsonProperty('duplicate.device')]
    public ?float $duplicateDevice;

    /**
     * @var ?float $historyFraudMailbox This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_mailbox')]
    public ?float $historyFraudMailbox;

    /**
     * @var ?float $historyFraudUser This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_user')]
    public ?float $historyFraudUser;

    /**
     * @var ?float $historyFraudIp This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_ip')]
    public ?float $historyFraudIp;

    /**
     * @var ?float $historyFraudSubnet This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_subnet')]
    public ?float $historyFraudSubnet;

    /**
     * @var ?float $historyFraudCard This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_card')]
    public ?float $historyFraudCard;

    /**
     * @var ?float $historyFraudDevice This reason's weight in this environment.
     */
    #[JsonProperty('history.fraud_device')]
    public ?float $historyFraudDevice;

    /**
     * @var ?float $checkoutCardCountryMismatch This reason's weight in this environment.
     */
    #[JsonProperty('checkout.card_country_mismatch')]
    public ?float $checkoutCardCountryMismatch;

    /**
     * @var ?float $checkoutBillingCountryMismatch This reason's weight in this environment.
     */
    #[JsonProperty('checkout.billing_country_mismatch')]
    public ?float $checkoutBillingCountryMismatch;

    /**
     * @var ?float $checkoutPrepaidCard This reason's weight in this environment.
     */
    #[JsonProperty('checkout.prepaid_card')]
    public ?float $checkoutPrepaidCard;

    /**
     * @var ?float $deviceAutomation This reason's weight in this environment.
     */
    #[JsonProperty('device.automation')]
    public ?float $deviceAutomation;

    /**
     * @var ?float $deviceInvalid This reason's weight in this environment.
     */
    #[JsonProperty('device.invalid')]
    public ?float $deviceInvalid;

    /**
     * @var ?float $loginNewCountry This reason's weight in this environment.
     */
    #[JsonProperty('login.new_country')]
    public ?float $loginNewCountry;

    /**
     * @var ?float $loginNewNetwork This reason's weight in this environment.
     */
    #[JsonProperty('login.new_network')]
    public ?float $loginNewNetwork;

    /**
     * @var ?float $captchaFailed This reason's weight in this environment.
     */
    #[JsonProperty('captcha.failed')]
    public ?float $captchaFailed;

    /**
     * @var ?float $captchaMissing This reason's weight in this environment.
     */
    #[JsonProperty('captcha.missing')]
    public ?float $captchaMissing;

    /**
     * @var ?float $contentSpam This reason's weight in this environment.
     */
    #[JsonProperty('content.spam')]
    public ?float $contentSpam;

    /**
     * @var ?float $contentPhishing This reason's weight in this environment.
     */
    #[JsonProperty('content.phishing')]
    public ?float $contentPhishing;

    /**
     * @var ?float $contentMalware This reason's weight in this environment.
     */
    #[JsonProperty('content.malware')]
    public ?float $contentMalware;

    /**
     * @var ?float $contentFraud This reason's weight in this environment.
     */
    #[JsonProperty('content.fraud')]
    public ?float $contentFraud;

    /**
     * @param array{
     *   emailInvalid?: ?float,
     *   emailDisposable?: ?float,
     *   emailUndeliverable?: ?float,
     *   emailRoleAccount?: ?float,
     *   emailTypo?: ?float,
     *   emailDomainNew?: ?float,
     *   ipTor?: ?float,
     *   ipVpnNetwork?: ?float,
     *   ipHostingProvider?: ?float,
     *   ipVpn?: ?float,
     *   ipProxy?: ?float,
     *   ipRelay?: ?float,
     *   ipPrivate?: ?float,
     *   velocitySignupsPerIp1H?: ?float,
     *   velocitySignupsPerIp24H?: ?float,
     *   velocitySignupsPerSubnet1H?: ?float,
     *   velocitySignupsPerEmailDomain1H?: ?float,
     *   velocitySignupsPerMailbox24H?: ?float,
     *   velocitySignupsPerDevice24H?: ?float,
     *   velocityCheckoutsPerIp1H?: ?float,
     *   velocityCheckoutsPerUser1H?: ?float,
     *   velocityCheckoutsPerCard24H?: ?float,
     *   velocityLoginsPerIp1H?: ?float,
     *   velocityLoginsPerUser1H?: ?float,
     *   velocityEventsPerIp1H?: ?float,
     *   velocityEventsPerUser1H?: ?float,
     *   duplicateCanonicalMailbox?: ?float,
     *   duplicateDevice?: ?float,
     *   historyFraudMailbox?: ?float,
     *   historyFraudUser?: ?float,
     *   historyFraudIp?: ?float,
     *   historyFraudSubnet?: ?float,
     *   historyFraudCard?: ?float,
     *   historyFraudDevice?: ?float,
     *   checkoutCardCountryMismatch?: ?float,
     *   checkoutBillingCountryMismatch?: ?float,
     *   checkoutPrepaidCard?: ?float,
     *   deviceAutomation?: ?float,
     *   deviceInvalid?: ?float,
     *   loginNewCountry?: ?float,
     *   loginNewNetwork?: ?float,
     *   captchaFailed?: ?float,
     *   captchaMissing?: ?float,
     *   contentSpam?: ?float,
     *   contentPhishing?: ?float,
     *   contentMalware?: ?float,
     *   contentFraud?: ?float,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->emailInvalid = $values['emailInvalid'] ?? null;
        if (array_key_exists('emailInvalid', $values)) {
            $this->_setField('emailInvalid');
        }
        $this->emailDisposable = $values['emailDisposable'] ?? null;
        if (array_key_exists('emailDisposable', $values)) {
            $this->_setField('emailDisposable');
        }
        $this->emailUndeliverable = $values['emailUndeliverable'] ?? null;
        if (array_key_exists('emailUndeliverable', $values)) {
            $this->_setField('emailUndeliverable');
        }
        $this->emailRoleAccount = $values['emailRoleAccount'] ?? null;
        if (array_key_exists('emailRoleAccount', $values)) {
            $this->_setField('emailRoleAccount');
        }
        $this->emailTypo = $values['emailTypo'] ?? null;
        if (array_key_exists('emailTypo', $values)) {
            $this->_setField('emailTypo');
        }
        $this->emailDomainNew = $values['emailDomainNew'] ?? null;
        if (array_key_exists('emailDomainNew', $values)) {
            $this->_setField('emailDomainNew');
        }
        $this->ipTor = $values['ipTor'] ?? null;
        if (array_key_exists('ipTor', $values)) {
            $this->_setField('ipTor');
        }
        $this->ipVpnNetwork = $values['ipVpnNetwork'] ?? null;
        if (array_key_exists('ipVpnNetwork', $values)) {
            $this->_setField('ipVpnNetwork');
        }
        $this->ipHostingProvider = $values['ipHostingProvider'] ?? null;
        if (array_key_exists('ipHostingProvider', $values)) {
            $this->_setField('ipHostingProvider');
        }
        $this->ipVpn = $values['ipVpn'] ?? null;
        if (array_key_exists('ipVpn', $values)) {
            $this->_setField('ipVpn');
        }
        $this->ipProxy = $values['ipProxy'] ?? null;
        if (array_key_exists('ipProxy', $values)) {
            $this->_setField('ipProxy');
        }
        $this->ipRelay = $values['ipRelay'] ?? null;
        if (array_key_exists('ipRelay', $values)) {
            $this->_setField('ipRelay');
        }
        $this->ipPrivate = $values['ipPrivate'] ?? null;
        if (array_key_exists('ipPrivate', $values)) {
            $this->_setField('ipPrivate');
        }
        $this->velocitySignupsPerIp1H = $values['velocitySignupsPerIp1H'] ?? null;
        if (array_key_exists('velocitySignupsPerIp1H', $values)) {
            $this->_setField('velocitySignupsPerIp1H');
        }
        $this->velocitySignupsPerIp24H = $values['velocitySignupsPerIp24H'] ?? null;
        if (array_key_exists('velocitySignupsPerIp24H', $values)) {
            $this->_setField('velocitySignupsPerIp24H');
        }
        $this->velocitySignupsPerSubnet1H = $values['velocitySignupsPerSubnet1H'] ?? null;
        if (array_key_exists('velocitySignupsPerSubnet1H', $values)) {
            $this->_setField('velocitySignupsPerSubnet1H');
        }
        $this->velocitySignupsPerEmailDomain1H = $values['velocitySignupsPerEmailDomain1H'] ?? null;
        if (array_key_exists('velocitySignupsPerEmailDomain1H', $values)) {
            $this->_setField('velocitySignupsPerEmailDomain1H');
        }
        $this->velocitySignupsPerMailbox24H = $values['velocitySignupsPerMailbox24H'] ?? null;
        if (array_key_exists('velocitySignupsPerMailbox24H', $values)) {
            $this->_setField('velocitySignupsPerMailbox24H');
        }
        $this->velocitySignupsPerDevice24H = $values['velocitySignupsPerDevice24H'] ?? null;
        if (array_key_exists('velocitySignupsPerDevice24H', $values)) {
            $this->_setField('velocitySignupsPerDevice24H');
        }
        $this->velocityCheckoutsPerIp1H = $values['velocityCheckoutsPerIp1H'] ?? null;
        if (array_key_exists('velocityCheckoutsPerIp1H', $values)) {
            $this->_setField('velocityCheckoutsPerIp1H');
        }
        $this->velocityCheckoutsPerUser1H = $values['velocityCheckoutsPerUser1H'] ?? null;
        if (array_key_exists('velocityCheckoutsPerUser1H', $values)) {
            $this->_setField('velocityCheckoutsPerUser1H');
        }
        $this->velocityCheckoutsPerCard24H = $values['velocityCheckoutsPerCard24H'] ?? null;
        if (array_key_exists('velocityCheckoutsPerCard24H', $values)) {
            $this->_setField('velocityCheckoutsPerCard24H');
        }
        $this->velocityLoginsPerIp1H = $values['velocityLoginsPerIp1H'] ?? null;
        if (array_key_exists('velocityLoginsPerIp1H', $values)) {
            $this->_setField('velocityLoginsPerIp1H');
        }
        $this->velocityLoginsPerUser1H = $values['velocityLoginsPerUser1H'] ?? null;
        if (array_key_exists('velocityLoginsPerUser1H', $values)) {
            $this->_setField('velocityLoginsPerUser1H');
        }
        $this->velocityEventsPerIp1H = $values['velocityEventsPerIp1H'] ?? null;
        if (array_key_exists('velocityEventsPerIp1H', $values)) {
            $this->_setField('velocityEventsPerIp1H');
        }
        $this->velocityEventsPerUser1H = $values['velocityEventsPerUser1H'] ?? null;
        if (array_key_exists('velocityEventsPerUser1H', $values)) {
            $this->_setField('velocityEventsPerUser1H');
        }
        $this->duplicateCanonicalMailbox = $values['duplicateCanonicalMailbox'] ?? null;
        if (array_key_exists('duplicateCanonicalMailbox', $values)) {
            $this->_setField('duplicateCanonicalMailbox');
        }
        $this->duplicateDevice = $values['duplicateDevice'] ?? null;
        if (array_key_exists('duplicateDevice', $values)) {
            $this->_setField('duplicateDevice');
        }
        $this->historyFraudMailbox = $values['historyFraudMailbox'] ?? null;
        if (array_key_exists('historyFraudMailbox', $values)) {
            $this->_setField('historyFraudMailbox');
        }
        $this->historyFraudUser = $values['historyFraudUser'] ?? null;
        if (array_key_exists('historyFraudUser', $values)) {
            $this->_setField('historyFraudUser');
        }
        $this->historyFraudIp = $values['historyFraudIp'] ?? null;
        if (array_key_exists('historyFraudIp', $values)) {
            $this->_setField('historyFraudIp');
        }
        $this->historyFraudSubnet = $values['historyFraudSubnet'] ?? null;
        if (array_key_exists('historyFraudSubnet', $values)) {
            $this->_setField('historyFraudSubnet');
        }
        $this->historyFraudCard = $values['historyFraudCard'] ?? null;
        if (array_key_exists('historyFraudCard', $values)) {
            $this->_setField('historyFraudCard');
        }
        $this->historyFraudDevice = $values['historyFraudDevice'] ?? null;
        if (array_key_exists('historyFraudDevice', $values)) {
            $this->_setField('historyFraudDevice');
        }
        $this->checkoutCardCountryMismatch = $values['checkoutCardCountryMismatch'] ?? null;
        if (array_key_exists('checkoutCardCountryMismatch', $values)) {
            $this->_setField('checkoutCardCountryMismatch');
        }
        $this->checkoutBillingCountryMismatch = $values['checkoutBillingCountryMismatch'] ?? null;
        if (array_key_exists('checkoutBillingCountryMismatch', $values)) {
            $this->_setField('checkoutBillingCountryMismatch');
        }
        $this->checkoutPrepaidCard = $values['checkoutPrepaidCard'] ?? null;
        if (array_key_exists('checkoutPrepaidCard', $values)) {
            $this->_setField('checkoutPrepaidCard');
        }
        $this->deviceAutomation = $values['deviceAutomation'] ?? null;
        if (array_key_exists('deviceAutomation', $values)) {
            $this->_setField('deviceAutomation');
        }
        $this->deviceInvalid = $values['deviceInvalid'] ?? null;
        if (array_key_exists('deviceInvalid', $values)) {
            $this->_setField('deviceInvalid');
        }
        $this->loginNewCountry = $values['loginNewCountry'] ?? null;
        if (array_key_exists('loginNewCountry', $values)) {
            $this->_setField('loginNewCountry');
        }
        $this->loginNewNetwork = $values['loginNewNetwork'] ?? null;
        if (array_key_exists('loginNewNetwork', $values)) {
            $this->_setField('loginNewNetwork');
        }
        $this->captchaFailed = $values['captchaFailed'] ?? null;
        if (array_key_exists('captchaFailed', $values)) {
            $this->_setField('captchaFailed');
        }
        $this->captchaMissing = $values['captchaMissing'] ?? null;
        if (array_key_exists('captchaMissing', $values)) {
            $this->_setField('captchaMissing');
        }
        $this->contentSpam = $values['contentSpam'] ?? null;
        if (array_key_exists('contentSpam', $values)) {
            $this->_setField('contentSpam');
        }
        $this->contentPhishing = $values['contentPhishing'] ?? null;
        if (array_key_exists('contentPhishing', $values)) {
            $this->_setField('contentPhishing');
        }
        $this->contentMalware = $values['contentMalware'] ?? null;
        if (array_key_exists('contentMalware', $values)) {
            $this->_setField('contentMalware');
        }
        $this->contentFraud = $values['contentFraud'] ?? null;
        if (array_key_exists('contentFraud', $values)) {
            $this->_setField('contentFraud');
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
