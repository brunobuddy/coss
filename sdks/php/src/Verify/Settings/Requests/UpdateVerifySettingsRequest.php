<?php

namespace Coss\Verify\Settings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

class UpdateVerifySettingsRequest extends JsonSerializableType
{
    /**
     * @var ?string $appName The name codes are sent for; `null`: the project's.
     */
    #[JsonProperty('app_name')]
    public ?string $appName;

    /**
     * @var ?int $codeLength Digits in a code, 4-10.
     */
    #[JsonProperty('code_length')]
    public ?int $codeLength;

    /**
     * @var ?int $ttlSeconds How long a code works, 60-1800 s.
     */
    #[JsonProperty('ttl_seconds')]
    public ?int $ttlSeconds;

    /**
     * @var ?int $maxAttempts Wrong codes before a verification fails, 1-10.
     */
    #[JsonProperty('max_attempts')]
    public ?int $maxAttempts;

    /**
     * @var ?string $smsFrom One of the organization's numbers; `null`: coss.com's shared numbers.
     */
    #[JsonProperty('sms_from')]
    public ?string $smsFrom;

    /**
     * @var ?string $emailFrom An address on one of the organization's verified domains (live keys); `null`: coss.com's.
     */
    #[JsonProperty('email_from')]
    public ?string $emailFrom;

    /**
     * @var ?array<string> $allowedCountries ISO 3166 countries SMS codes may go to.
     */
    #[JsonProperty('allowed_countries'), ArrayType(['string'])]
    public ?array $allowedCountries;

    /**
     * @param array{
     *   appName?: ?string,
     *   codeLength?: ?int,
     *   ttlSeconds?: ?int,
     *   maxAttempts?: ?int,
     *   smsFrom?: ?string,
     *   emailFrom?: ?string,
     *   allowedCountries?: ?array<string>,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->appName = $values['appName'] ?? null;
        if (array_key_exists('appName', $values)) {
            $this->_setField('appName');
        }
        $this->codeLength = $values['codeLength'] ?? null;
        if (array_key_exists('codeLength', $values)) {
            $this->_setField('codeLength');
        }
        $this->ttlSeconds = $values['ttlSeconds'] ?? null;
        if (array_key_exists('ttlSeconds', $values)) {
            $this->_setField('ttlSeconds');
        }
        $this->maxAttempts = $values['maxAttempts'] ?? null;
        if (array_key_exists('maxAttempts', $values)) {
            $this->_setField('maxAttempts');
        }
        $this->smsFrom = $values['smsFrom'] ?? null;
        if (array_key_exists('smsFrom', $values)) {
            $this->_setField('smsFrom');
        }
        $this->emailFrom = $values['emailFrom'] ?? null;
        if (array_key_exists('emailFrom', $values)) {
            $this->_setField('emailFrom');
        }
        $this->allowedCountries = $values['allowedCountries'] ?? null;
        if (array_key_exists('allowedCountries', $values)) {
            $this->_setField('allowedCountries');
        }
    }
}
