<?php

namespace Coss\Sign\Settings\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;
use Coss\Sign\Settings\Types\UpdateSignSettingsRequestTheme;

class UpdateSignSettingsRequest extends JsonSerializableType
{
    /**
     * @var ?array<string> $allowedOrigins Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:<port>`). Empty: it can only be opened on its own.
     */
    #[JsonProperty('allowed_origins'), ArrayType(['string'])]
    public ?array $allowedOrigins;

    /**
     * @var ?string $displayName The requester's name signers see. `null`: the organization's name.
     */
    #[JsonProperty('display_name')]
    public ?string $displayName;

    /**
     * @var ?string $accentColor The signing page's accent color, as `#RRGGBB`. `null`: the default.
     */
    #[JsonProperty('accent_color')]
    public ?string $accentColor;

    /**
     * @var ?value-of<UpdateSignSettingsRequestTheme> $theme The signing page's theme. `system` follows the signer's device.
     */
    #[JsonProperty('theme')]
    public ?string $theme;

    /**
     * @var ?string $disclosure Your own consent text signers accept before they see a document. `null`: coss.com's default. Have your counsel review a replacement.
     */
    #[JsonProperty('disclosure')]
    public ?string $disclosure;

    /**
     * @var ?string $emailFrom Signing emails come from this address, on a verified domain in live environments. `null`: from coss.com, as "<display name> via coss.com".
     */
    #[JsonProperty('email_from')]
    public ?string $emailFrom;

    /**
     * @var ?int $reminderIntervalDays The default days between reminders for new requests. `null`: none.
     */
    #[JsonProperty('reminder_interval_days')]
    public ?int $reminderIntervalDays;

    /**
     * @param array{
     *   allowedOrigins?: ?array<string>,
     *   displayName?: ?string,
     *   accentColor?: ?string,
     *   theme?: ?value-of<UpdateSignSettingsRequestTheme>,
     *   disclosure?: ?string,
     *   emailFrom?: ?string,
     *   reminderIntervalDays?: ?int,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->allowedOrigins = $values['allowedOrigins'] ?? null;
        if (array_key_exists('allowedOrigins', $values)) {
            $this->_setField('allowedOrigins');
        }
        $this->displayName = $values['displayName'] ?? null;
        if (array_key_exists('displayName', $values)) {
            $this->_setField('displayName');
        }
        $this->accentColor = $values['accentColor'] ?? null;
        if (array_key_exists('accentColor', $values)) {
            $this->_setField('accentColor');
        }
        $this->theme = $values['theme'] ?? null;
        if (array_key_exists('theme', $values)) {
            $this->_setField('theme');
        }
        $this->disclosure = $values['disclosure'] ?? null;
        if (array_key_exists('disclosure', $values)) {
            $this->_setField('disclosure');
        }
        $this->emailFrom = $values['emailFrom'] ?? null;
        if (array_key_exists('emailFrom', $values)) {
            $this->_setField('emailFrom');
        }
        $this->reminderIntervalDays = $values['reminderIntervalDays'] ?? null;
        if (array_key_exists('reminderIntervalDays', $values)) {
            $this->_setField('reminderIntervalDays');
        }
    }
}
