using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Who the submitter is, and whether they must confirm by email.
/// </summary>
[Serializable]
public record FormSubmitter : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The field holding the submitter's email address.
    /// </summary>
    [JsonPropertyName("email_field")]
    public required string EmailField { get; set; }

    /// <summary>
    /// Whether submissions wait until the submitter clicks a link emailed to them.
    /// </summary>
    [JsonPropertyName("verify")]
    public required bool Verify { get; set; }

    /// <summary>
    /// The verification email's sender. `null`: none set.
    /// </summary>
    [Nullable]
    [JsonPropertyName("confirmation_from")]
    public string? ConfirmationFrom { get; set; }

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
