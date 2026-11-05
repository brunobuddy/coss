using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Inbox : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required InboxObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// The inbox's email address (`username@domain`).
    /// </summary>
    [JsonPropertyName("address")]
    public required string Address { get; set; }

    /// <summary>
    /// The part of the address before the `@`.
    /// </summary>
    [JsonPropertyName("username")]
    public required string Username { get; set; }

    /// <summary>
    /// The part of the address after the `@`.
    /// </summary>
    [JsonPropertyName("domain")]
    public required string Domain { get; set; }

    /// <summary>
    /// `managed`: at the environment's own domain under coss.com's inbound domain (no DNS setup). `domain`: at one of the environment's receiving domains.
    /// </summary>
    [JsonPropertyName("kind")]
    public required InboxKind Kind { get; set; }

    /// <summary>
    /// The name messages from the inbox are sent with.
    /// </summary>
    [Nullable]
    [JsonPropertyName("display_name")]
    public string? DisplayName { get; set; }

    /// <summary>
    /// Your own id for the inbox, e.g. your agent's or user's (unique per environment).
    /// </summary>
    [Nullable]
    [JsonPropertyName("client_id")]
    public string? ClientId { get; set; }

    /// <summary>
    /// Whether messages can be sent from the inbox. Inboxes at coss.com's inbound domain only receive in live environments: create the inbox at a receiving domain under one of your verified domains to send from it.
    /// </summary>
    [JsonPropertyName("can_send")]
    public required bool CanSend { get; set; }

    /// <summary>
    /// Whether it belongs to a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
