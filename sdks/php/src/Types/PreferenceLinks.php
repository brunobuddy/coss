<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;

class PreferenceLinks extends JsonSerializableType
{
    /**
     * @var value-of<PreferenceLinksObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $contactId The contact's id.
     */
    #[JsonProperty('contact_id')]
    public string $contactId;

    /**
     * @var string $preferencesUrl The contact's preference center.
     */
    #[JsonProperty('preferences_url')]
    public string $preferencesUrl;

    /**
     * @var string $unsubscribeUrl A one-button unsubscribe page.
     */
    #[JsonProperty('unsubscribe_url')]
    public string $unsubscribeUrl;

    /**
     * @param array{
     *   object: value-of<PreferenceLinksObject>,
     *   contactId: string,
     *   preferencesUrl: string,
     *   unsubscribeUrl: string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->contactId = $values['contactId'];
        $this->preferencesUrl = $values['preferencesUrl'];
        $this->unsubscribeUrl = $values['unsubscribeUrl'];
    }

    /**
     * @return string
     */
    public function __toString(): string
    {
        return $this->toJson();
    }
}
