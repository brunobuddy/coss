using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record EmailEventDataComplaint : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// The kind of complaint the mailbox provider reported. `null`: not reported.
    /// </summary>
    [Nullable]
    [JsonPropertyName("feedback_type")]
    public string? FeedbackType { get; set; }

    /// <summary>
    /// The provider's finer classification. `null`: not reported.
    /// </summary>
    [Nullable]
    [JsonPropertyName("sub_type")]
    public string? SubType { get; set; }

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
