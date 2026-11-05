using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record AuditEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required AuditEventObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("actor_type")]
    public required AuditActorType ActorType { get; set; }

    /// <summary>
    /// The user's or API key's id; `null` for the system.
    /// </summary>
    [Nullable]
    [JsonPropertyName("actor_id")]
    public string? ActorId { get; set; }

    /// <summary>
    /// Who made the change, copied when it was recorded so it outlives them: the user's email, the API key's id, or `coss.com support`.
    /// </summary>
    [JsonPropertyName("actor_label")]
    public required string ActorLabel { get; set; }

    /// <summary>
    /// `&lt;resource&gt;.&lt;verb&gt;`, e.g. `api_key.created`, `domain.deleted`, `member.role_changed`.
    /// </summary>
    [JsonPropertyName("action")]
    public required string Action { get; set; }

    /// <summary>
    /// What was changed: `domain`, `api_key`, `member`…
    /// </summary>
    [Nullable]
    [JsonPropertyName("target_type")]
    public string? TargetType { get; set; }

    /// <summary>
    /// The id of what it acted on. `null`: nothing in particular.
    /// </summary>
    [Nullable]
    [JsonPropertyName("target_id")]
    public string? TargetId { get; set; }

    /// <summary>
    /// A readable name for the target when it was changed.
    /// </summary>
    [Nullable]
    [JsonPropertyName("target_label")]
    public string? TargetLabel { get; set; }

    /// <summary>
    /// `null` for organization-wide changes (domains, members…).
    /// </summary>
    [Nullable]
    [JsonPropertyName("project_id")]
    public string? ProjectId { get; set; }

    /// <summary>
    /// `null` for organization-wide changes (domains, members…).
    /// </summary>
    [Nullable]
    [JsonPropertyName("environment_id")]
    public string? EnvironmentId { get; set; }

    /// <summary>
    /// Details of the change; API changes include their `request_id`.
    /// </summary>
    [JsonPropertyName("metadata")]
    public Dictionary<string, object?> Metadata { get; set; } = new Dictionary<string, object?>();

    /// <summary>
    /// The actor's address. `null`: unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("client_ip")]
    public string? ClientIp { get; set; }

    /// <summary>
    /// The actor's `User-Agent`. `null`: unknown.
    /// </summary>
    [Nullable]
    [JsonPropertyName("user_agent")]
    public string? UserAgent { get; set; }

    [JsonIgnore]
    public ReadOnlyAdditionalProperties AdditionalProperties { get; private set; } = new();

    void IJsonOnDeserialized.OnDeserialized() =>
        AdditionalProperties.CopyFromExtensionData(_extensionData);

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
