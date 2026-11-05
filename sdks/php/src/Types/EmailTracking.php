<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;

/**
 * Open and click tracking, as resolved when the email was sent, with engagement so far. Opens can be inflated by mail clients that prefetch images, clicks by link scanners.
 */
class EmailTracking extends JsonSerializableType
{
    /**
     * @var bool $opens Whether opens are tracked for this email.
     */
    #[JsonProperty('opens')]
    public bool $opens;

    /**
     * @var bool $clicks Whether link clicks are tracked for this email.
     */
    #[JsonProperty('clicks')]
    public bool $clicks;

    /**
     * @var bool $unsubscribe Whether the email carries one-click unsubscribe headers (RFC 8058).
     */
    #[JsonProperty('unsubscribe')]
    public bool $unsubscribe;

    /**
     * @var int $openCount Times opened. Mail clients that prefetch images inflate it.
     */
    #[JsonProperty('open_count')]
    public int $openCount;

    /**
     * @var ?DateTime $firstOpenedAt When it was first opened. `null`: not yet.
     */
    #[JsonProperty('first_opened_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $firstOpenedAt;

    /**
     * @var ?DateTime $lastOpenedAt When it was last opened. `null`: not yet.
     */
    #[JsonProperty('last_opened_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastOpenedAt;

    /**
     * @var int $clickCount Link clicks. Link scanners inflate it.
     */
    #[JsonProperty('click_count')]
    public int $clickCount;

    /**
     * @var ?DateTime $firstClickedAt When a link was first clicked. `null`: not yet.
     */
    #[JsonProperty('first_clicked_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $firstClickedAt;

    /**
     * @var ?DateTime $lastClickedAt When a link was last clicked. `null`: not yet.
     */
    #[JsonProperty('last_clicked_at'), Date(Date::TYPE_DATETIME)]
    public ?DateTime $lastClickedAt;

    /**
     * @param array{
     *   opens: bool,
     *   clicks: bool,
     *   unsubscribe: bool,
     *   openCount: int,
     *   clickCount: int,
     *   firstOpenedAt?: ?DateTime,
     *   lastOpenedAt?: ?DateTime,
     *   firstClickedAt?: ?DateTime,
     *   lastClickedAt?: ?DateTime,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->opens = $values['opens'];
        $this->clicks = $values['clicks'];
        $this->unsubscribe = $values['unsubscribe'];
        $this->openCount = $values['openCount'];
        $this->firstOpenedAt = $values['firstOpenedAt'] ?? null;
        if (array_key_exists('firstOpenedAt', $values)) {
            $this->_setField('firstOpenedAt');
        }
        $this->lastOpenedAt = $values['lastOpenedAt'] ?? null;
        if (array_key_exists('lastOpenedAt', $values)) {
            $this->_setField('lastOpenedAt');
        }
        $this->clickCount = $values['clickCount'];
        $this->firstClickedAt = $values['firstClickedAt'] ?? null;
        if (array_key_exists('firstClickedAt', $values)) {
            $this->_setField('firstClickedAt');
        }
        $this->lastClickedAt = $values['lastClickedAt'] ?? null;
        if (array_key_exists('lastClickedAt', $values)) {
            $this->_setField('lastClickedAt');
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
