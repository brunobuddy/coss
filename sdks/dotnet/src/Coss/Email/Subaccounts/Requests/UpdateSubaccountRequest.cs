using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record UpdateSubaccountRequest
{
    /// <summary>
    /// The sub-account's `id` (`sub_…`) or your `uid` for it.
    /// </summary>
    [JsonIgnore]
    public required string Subaccount { get; set; }

    /// <summary>
    /// Your name for it.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("uid")]
    public Optional<string?> Uid { get; set; }

    /// <summary>
    /// Replaces the metadata.
    /// </summary>
    [Optional]
    [JsonPropertyName("metadata")]
    public Dictionary<string, string>? Metadata { get; set; }

    /// <summary>
    /// `disabled` refuses its sends until it is `active` again.
    /// </summary>
    [Optional]
    [JsonPropertyName("status")]
    public UpdateSubaccountRequestStatus? Status { get; set; }

    /// <summary>
    /// Fields left out keep their value; `null` removes a quota.
    /// </summary>
    [Optional]
    [JsonPropertyName("quotas")]
    public UpdateSubaccountRequestQuotas? Quotas { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
