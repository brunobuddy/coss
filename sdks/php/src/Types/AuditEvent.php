<?php

namespace Coss\Types;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use DateTime;
use Coss\Core\Types\Date;
use Coss\Core\Types\ArrayType;

class AuditEvent extends JsonSerializableType
{
    /**
     * @var value-of<AuditEventObject> $object
     */
    #[JsonProperty('object')]
    public string $object;

    /**
     * @var string $id
     */
    #[JsonProperty('id')]
    public string $id;

    /**
     * @var DateTime $createdAt
     */
    #[JsonProperty('created_at'), Date(Date::TYPE_DATETIME)]
    public DateTime $createdAt;

    /**
     * @var value-of<AuditActorType> $actorType
     */
    #[JsonProperty('actor_type')]
    public string $actorType;

    /**
     * @var ?string $actorId The user's or API key's id; `null` for the system.
     */
    #[JsonProperty('actor_id')]
    public ?string $actorId;

    /**
     * @var string $actorLabel Who made the change, copied when it was recorded so it outlives them: the user's email, the API key's id, or `coss.com support`.
     */
    #[JsonProperty('actor_label')]
    public string $actorLabel;

    /**
     * @var string $action `<resource>.<verb>`, e.g. `api_key.created`, `domain.deleted`, `member.role_changed`.
     */
    #[JsonProperty('action')]
    public string $action;

    /**
     * @var ?string $targetType What was changed: `domain`, `api_key`, `member`…
     */
    #[JsonProperty('target_type')]
    public ?string $targetType;

    /**
     * @var ?string $targetId The id of what it acted on. `null`: nothing in particular.
     */
    #[JsonProperty('target_id')]
    public ?string $targetId;

    /**
     * @var ?string $targetLabel A readable name for the target when it was changed.
     */
    #[JsonProperty('target_label')]
    public ?string $targetLabel;

    /**
     * @var ?string $projectId `null` for organization-wide changes (domains, members…).
     */
    #[JsonProperty('project_id')]
    public ?string $projectId;

    /**
     * @var ?string $environmentId `null` for organization-wide changes (domains, members…).
     */
    #[JsonProperty('environment_id')]
    public ?string $environmentId;

    /**
     * @var array<string, mixed> $metadata Details of the change; API changes include their `request_id`.
     */
    #[JsonProperty('metadata'), ArrayType(['string' => 'mixed'])]
    public array $metadata;

    /**
     * @var ?string $clientIp The actor's address. `null`: unknown.
     */
    #[JsonProperty('client_ip')]
    public ?string $clientIp;

    /**
     * @var ?string $userAgent The actor's `User-Agent`. `null`: unknown.
     */
    #[JsonProperty('user_agent')]
    public ?string $userAgent;

    /**
     * @param array{
     *   object: value-of<AuditEventObject>,
     *   id: string,
     *   createdAt: DateTime,
     *   actorType: value-of<AuditActorType>,
     *   actorLabel: string,
     *   action: string,
     *   metadata: array<string, mixed>,
     *   actorId?: ?string,
     *   targetType?: ?string,
     *   targetId?: ?string,
     *   targetLabel?: ?string,
     *   projectId?: ?string,
     *   environmentId?: ?string,
     *   clientIp?: ?string,
     *   userAgent?: ?string,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->object = $values['object'];
        $this->id = $values['id'];
        $this->createdAt = $values['createdAt'];
        $this->actorType = $values['actorType'];
        $this->actorId = $values['actorId'] ?? null;
        if (array_key_exists('actorId', $values)) {
            $this->_setField('actorId');
        }
        $this->actorLabel = $values['actorLabel'];
        $this->action = $values['action'];
        $this->targetType = $values['targetType'] ?? null;
        if (array_key_exists('targetType', $values)) {
            $this->_setField('targetType');
        }
        $this->targetId = $values['targetId'] ?? null;
        if (array_key_exists('targetId', $values)) {
            $this->_setField('targetId');
        }
        $this->targetLabel = $values['targetLabel'] ?? null;
        if (array_key_exists('targetLabel', $values)) {
            $this->_setField('targetLabel');
        }
        $this->projectId = $values['projectId'] ?? null;
        if (array_key_exists('projectId', $values)) {
            $this->_setField('projectId');
        }
        $this->environmentId = $values['environmentId'] ?? null;
        if (array_key_exists('environmentId', $values)) {
            $this->_setField('environmentId');
        }
        $this->metadata = $values['metadata'];
        $this->clientIp = $values['clientIp'] ?? null;
        if (array_key_exists('clientIp', $values)) {
            $this->_setField('clientIp');
        }
        $this->userAgent = $values['userAgent'] ?? null;
        if (array_key_exists('userAgent', $values)) {
            $this->_setField('userAgent');
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
