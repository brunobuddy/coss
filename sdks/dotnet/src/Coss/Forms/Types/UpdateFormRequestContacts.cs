using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Turning submissions into contacts. Only the fields given change.
/// </summary>
[Serializable]
public record UpdateFormRequestContacts : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Turn each accepted submission into a contact, from `submitter.email_field`. Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <summary>
    /// Audiences the contact joins. They must exist in this environment.
    /// </summary>
    [Optional]
    [JsonPropertyName("audience_ids")]
    public IEnumerable<string>? AudienceIds { get; set; }

    /// <summary>
    /// Topic keys the contact is opted into.
    /// </summary>
    [Optional]
    [JsonPropertyName("topics")]
    public IEnumerable<string>? Topics { get; set; }

    /// <summary>
    /// New contacts confirm their subscription by email first. `null` (default): the environment's marketing settings decide.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("double_opt_in")]
    public Optional<bool?> DoubleOptIn { get; set; }

    /// <summary>
    /// The field holding the contact's first name. `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("first_name_field")]
    public Optional<string?> FirstNameField { get; set; }

    /// <summary>
    /// The field holding the contact's last name. `null`: none.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("last_name_field")]
    public Optional<string?> LastNameField { get; set; }

    /// <summary>
    /// Contact property key → the field whose value it takes.
    /// </summary>
    [Optional]
    [JsonPropertyName("properties")]
    public Dictionary<string, string>? Properties { get; set; }

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
