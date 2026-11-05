using Coss;
using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Email;

[Serializable]
public record ImportContactsRequestContactsItem : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The contact's address (validated on its own).
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

    /// <summary>
    /// Their first name.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("first_name")]
    public Optional<string?> FirstName { get; set; }

    /// <summary>
    /// Their last name.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("last_name")]
    public Optional<string?> LastName { get; set; }

    /// <summary>
    /// Custom properties by key, checked against their definitions.
    /// </summary>
    [Optional]
    [JsonPropertyName("properties")]
    public Dictionary<string, OneOf<string, double, bool>?>? Properties { get; set; }

    /// <summary>
    /// `subscribed` or `unsubscribed` (anything else, like an export's `pending`, is reported in `invalid`). Omitted, a new contact is `subscribed` and an existing one keeps its status.
    /// </summary>
    [Optional]
    [JsonPropertyName("status")]
    public string? Status { get; set; }

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
