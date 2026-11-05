using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Turning submissions into contacts.
/// </summary>
[Serializable]
public record FormContacts : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether each accepted submission becomes a contact.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// Audiences the contact joins.
    /// </summary>
    [JsonPropertyName("audience_ids")]
    public IEnumerable<string> AudienceIds { get; set; } = new List<string>();

    /// <summary>
    /// Topic keys the contact is opted into.
    /// </summary>
    [JsonPropertyName("topics")]
    public IEnumerable<string> Topics { get; set; } = new List<string>();

    /// <summary>
    /// Whether new contacts confirm by email first. `null`: the environment's marketing settings decide.
    /// </summary>
    [Nullable]
    [JsonPropertyName("double_opt_in")]
    public bool? DoubleOptIn { get; set; }

    /// <summary>
    /// The field holding the contact's first name. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("first_name_field")]
    public string? FirstNameField { get; set; }

    /// <summary>
    /// The field holding the contact's last name. `null`: none.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_name_field")]
    public string? LastNameField { get; set; }

    /// <summary>
    /// Contact property key → the field whose value it takes.
    /// </summary>
    [JsonPropertyName("properties")]
    public Dictionary<string, string> Properties { get; set; } = new Dictionary<string, string>();

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
