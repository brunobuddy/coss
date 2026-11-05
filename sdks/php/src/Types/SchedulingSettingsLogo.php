<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

/**
 * At the top of the hosted pages, and of emails sent from `email_from`.
 */
class SchedulingSettingsLogo extends JsonSerializableType
{
    /**
     * @var value-of<SchedulingSettingsLogoContentType> $contentType The image's type, checked from its bytes.
     */
    #[JsonProperty('content_type')]
    public string $contentType;

    /**
     * @var int $width Width in pixels.
     */
    #[JsonProperty('width')]
    public int $width;

    /**
     * @var int $height Height in pixels.
     */
    #[JsonProperty('height')]
    public int $height;

    /**
     * @var string $dataUrl The image, as a `data:` URL.
     */
    #[JsonProperty('data_url')]
    public string $dataUrl;

    /**
     * @param array{
     *   contentType: value-of<SchedulingSettingsLogoContentType>,
     *   width: int,
     *   height: int,
     *   dataUrl: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->contentType = $values['contentType'];
        $this->width = $values['width'];
        $this->height = $values['height'];
        $this->dataUrl = $values['dataUrl'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
