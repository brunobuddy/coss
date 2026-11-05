<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Core\Types\ArrayType;

/**
 * What this event recorded, depending on its type.
 */
class SignEventDetails extends JsonSerializableType
{
    /**
     * @var ?string $reason `declined`: the signer's reason.
     */
    #[JsonProperty('reason')]
    public ?string $reason;

    /**
     * @var ?array<string, string> $documentSha256 Each document's SHA-256 at that moment, by document id.
     */
    #[JsonProperty('document_sha256'), ArrayType(['string' => 'string'])]
    public ?array $documentSha256;

    /**
     * @var ?string $disclosureSha256 SHA-256 of the consent text the signer accepted.
     */
    #[JsonProperty('disclosure_sha256')]
    public ?string $disclosureSha256;

    /**
     * @var ?array<string> $fieldIds `signed`: the fields the signer filled.
     */
    #[JsonProperty('field_ids'), ArrayType(['string'])]
    public ?array $fieldIds;

    /**
     * @var ?string $signatureSha256 SHA-256 of the signature image the signer adopted.
     */
    #[JsonProperty('signature_sha256')]
    public ?string $signatureSha256;

    /**
     * @var ?string $initialsSha256 SHA-256 of the initials image the signer adopted.
     */
    #[JsonProperty('initials_sha256')]
    public ?string $initialsSha256;

    /**
     * @var ?string $sessionId The signing session the signer used.
     */
    #[JsonProperty('session_id')]
    public ?string $sessionId;

    /**
     * @var ?string $signedDocumentSha256 `sealed`: the SHA-256 of the sealed, completed document.
     */
    #[JsonProperty('signed_document_sha256')]
    public ?string $signedDocumentSha256;

    /**
     * @param array{
     *   reason?: ?string,
     *   documentSha256?: ?array<string, string>,
     *   disclosureSha256?: ?string,
     *   fieldIds?: ?array<string>,
     *   signatureSha256?: ?string,
     *   initialsSha256?: ?string,
     *   sessionId?: ?string,
     *   signedDocumentSha256?: ?string,
     * } $values
     */
    public function __construct(
        array $values = [],
    ) {
        $this->reason = $values['reason'] ?? null;
        if (array_key_exists('reason', $values)) {
            $this->_setField('reason');
        }
        $this->documentSha256 = $values['documentSha256'] ?? null;
        if (array_key_exists('documentSha256', $values)) {
            $this->_setField('documentSha256');
        }
        $this->disclosureSha256 = $values['disclosureSha256'] ?? null;
        if (array_key_exists('disclosureSha256', $values)) {
            $this->_setField('disclosureSha256');
        }
        $this->fieldIds = $values['fieldIds'] ?? null;
        if (array_key_exists('fieldIds', $values)) {
            $this->_setField('fieldIds');
        }
        $this->signatureSha256 = $values['signatureSha256'] ?? null;
        if (array_key_exists('signatureSha256', $values)) {
            $this->_setField('signatureSha256');
        }
        $this->initialsSha256 = $values['initialsSha256'] ?? null;
        if (array_key_exists('initialsSha256', $values)) {
            $this->_setField('initialsSha256');
        }
        $this->sessionId = $values['sessionId'] ?? null;
        if (array_key_exists('sessionId', $values)) {
            $this->_setField('sessionId');
        }
        $this->signedDocumentSha256 = $values['signedDocumentSha256'] ?? null;
        if (array_key_exists('signedDocumentSha256', $values)) {
            $this->_setField('signedDocumentSha256');
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
