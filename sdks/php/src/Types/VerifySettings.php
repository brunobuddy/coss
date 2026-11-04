<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * An environment's Verify settings.
 */
class VerifySettings extends JsonSerializableType
{
    /**
     * @var value-of<VerifySettingsObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $appName The name codes are sent for.
     */
    #[JsonProperty('app_name')]
    public string $appName;

    /**
     * @var bool $appNameIsDefault Whether `app_name` is the project's: no name of its own is set.
     */
    #[JsonProperty('app_name_is_default')]
    public bool $appNameIsDefault;

    /**
     * @var int $codeLength Digits in a code.
     */
    #[JsonProperty('code_length')]
    public int $codeLength;

    /**
     * @var int $ttlSeconds How long a code works.
     */
    #[JsonProperty('ttl_seconds')]
    public int $ttlSeconds;

    /**
     * @var int $maxAttempts Wrong codes before a verification fails.
     */
    #[JsonProperty('max_attempts')]
    public int $maxAttempts;

    /**
     * @var ?string $smsFrom One of the organization's numbers; `null`: coss.com's shared numbers.
     */
    #[JsonProperty('sms_from')]
    public ?string $smsFrom;

    /**
     * @var ?string $emailFrom An address on one of the organization's verified domains; `null`: coss.com's.
     */
    #[JsonProperty('email_from')]
    public ?string $emailFrom;

    /**
     * @var array<string> $allowedCountries ISO 3166 countries SMS codes may go to.
     */
    #[JsonProperty('allowed_countries'), ArrayType(['string'])]
    public array $allowedCountries;

    /**
     * @param array{
     *   object: value-of<VerifySettingsObject>,
     *   appName: string,
     *   appNameIsDefault: bool,
     *   codeLength: int,
     *   ttlSeconds: int,
     *   maxAttempts: int,
     *   allowedCountries: array<string>,
     *   smsFrom?: ?string,
     *   emailFrom?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->appName = $values['appName'];
        $this->appNameIsDefault = $values['appNameIsDefault'];
        $this->codeLength = $values['codeLength'];
        $this->ttlSeconds = $values['ttlSeconds'];
        $this->maxAttempts = $values['maxAttempts'];
        $this->smsFrom = $values['smsFrom'] ?? null;
        if (array_key_exists('smsFrom', $values)) {
            $this->_setField('smsFrom');
        }
        $this->emailFrom = $values['emailFrom'] ?? null;
        if (array_key_exists('emailFrom', $values)) {
            $this->_setField('emailFrom');
        }
        $this->allowedCountries = $values['allowedCountries'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
