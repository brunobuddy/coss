using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Email.Contacts;

[Serializable]
public record CreateContactPropertyRequest
{
    /// <summary>
    /// How contacts and templates name it. Lower-case letters, digits and `_`, starting with a letter. Can't change.
    /// </summary>
    [JsonPropertyName("key")]
    public required string Key { get; set; }

    /// <summary>
    /// What values it takes. `date` values are ISO 8601 strings. Can't change.
    /// </summary>
    [JsonPropertyName("type")]
    public required CreateContactPropertyRequestType Type { get; set; }

    /// <summary>
    /// Used in templates for contacts without a value.
    /// </summary>
    [Optional]
    [JsonPropertyName("fallback")]
    public OneOf<string, double, bool>? Fallback { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
