<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * What the address says. `null` on an assessment with no IP.
 */
class RiskIpSignals extends JsonSerializableType
{
    /**
     * @var float $version
     */
    #[JsonProperty('version')]
    public float $version;

    /**
     * @var bool $private Whether it's a private or reserved address.
     */
    #[JsonProperty('private')]
    public bool $private;

    /**
     * @var bool $tor Whether it's a Tor exit.
     */
    #[JsonProperty('tor')]
    public bool $tor;

    /**
     * @var bool $hosting Whether it's in a cloud, hosting or VPN network.
     */
    #[JsonProperty('hosting')]
    public bool $hosting;

    /**
     * @var ?string $hostingProvider That network's operator. `null` when it isn't one.
     */
    #[JsonProperty('hosting_provider')]
    public ?string $hostingProvider;

    /**
     * @var ?value-of<RiskIpSignalsHostingKind> $hostingKind `cloud`, `hosting` or `vpn`. `null` when it isn't one.
     */
    #[JsonProperty('hosting_kind')]
    public ?string $hostingKind;

    /**
     * @var ?int $asn The network's autonomous system number. `null` when unknown.
     */
    #[JsonProperty('asn')]
    public ?int $asn;

    /**
     * @var ?string $asName The network's name. `null` when unknown.
     */
    #[JsonProperty('as_name')]
    public ?string $asName;

    /**
     * @var ?string $country ISO 3166-1 alpha-2.
     */
    #[JsonProperty('country')]
    public ?string $country;

    /**
     * @var ?RiskIpPrivacy $privacy From coss.com's IP privacy data provider (VPNs, proxies, relays). `null` when it isn't available or was not asked (private addresses).
     */
    #[JsonProperty('privacy')]
    public ?RiskIpPrivacy $privacy;

    /**
     * @param array{
     *   version: float,
     *   private: bool,
     *   tor: bool,
     *   hosting: bool,
     *   hostingProvider?: ?string,
     *   hostingKind?: ?value-of<RiskIpSignalsHostingKind>,
     *   asn?: ?int,
     *   asName?: ?string,
     *   country?: ?string,
     *   privacy?: ?RiskIpPrivacy,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->version = $values['version'];
        $this->private = $values['private'];
        $this->tor = $values['tor'];
        $this->hosting = $values['hosting'];
        $this->hostingProvider = $values['hostingProvider'] ?? null;
        if (array_key_exists('hostingProvider', $values)) {
            $this->_setField('hostingProvider');
        }
        $this->hostingKind = $values['hostingKind'] ?? null;
        if (array_key_exists('hostingKind', $values)) {
            $this->_setField('hostingKind');
        }
        $this->asn = $values['asn'] ?? null;
        if (array_key_exists('asn', $values)) {
            $this->_setField('asn');
        }
        $this->asName = $values['asName'] ?? null;
        if (array_key_exists('asName', $values)) {
            $this->_setField('asName');
        }
        $this->country = $values['country'] ?? null;
        if (array_key_exists('country', $values)) {
            $this->_setField('country');
        }
        $this->privacy = $values['privacy'] ?? null;
        if (array_key_exists('privacy', $values)) {
            $this->_setField('privacy');
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
