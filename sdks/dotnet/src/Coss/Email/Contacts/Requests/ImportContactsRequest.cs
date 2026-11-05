using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record ImportContactsRequest
{
    /// <summary>
    /// The contacts to create or update, at most 1,000.
    /// </summary>
    [JsonPropertyName("contacts")]
    public IEnumerable<ImportContactsRequestContactsItem> Contacts { get; set; } =
        new List<ImportContactsRequestContactsItem>();

    /// <summary>
    /// Adds every imported contact to this audience.
    /// </summary>
    [Optional]
    [JsonPropertyName("audience_id")]
    public string? AudienceId { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
