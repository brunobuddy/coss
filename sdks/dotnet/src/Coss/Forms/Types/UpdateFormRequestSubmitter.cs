using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Who the submitter is, and whether they must confirm by email. Only the fields given change.
/// </summary>
[Serializable]
public record UpdateFormRequestSubmitter : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The field holding the submitter's email address (Risk checks it, notifications reply to it, contacts are made from it). Default `email`.
    /// </summary>
    [Optional]
    [JsonPropertyName("email_field")]
    public string? EmailField { get; set; }

    /// <summary>
    /// Hold every submission until the submitter clicks the link emailed to them (double opt-in for the whole submission). Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("verify")]
    public bool? Verify { get; set; }

    /// <summary>
    /// The verification email's sender: an address on a verified domain (required with `verify` in live environments).
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmation_from")]
    public Optional<string?> ConfirmationFrom { get; set; }

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
