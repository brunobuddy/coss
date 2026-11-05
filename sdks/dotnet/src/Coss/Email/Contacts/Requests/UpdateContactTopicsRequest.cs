using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record UpdateContactTopicsRequest
{
    /// <summary>
    /// The contact's id, or its address (URL-encoded).
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// The contact's choices per topic. Topics not listed keep theirs.
    /// </summary>
    [JsonPropertyName("topics")]
    public IEnumerable<UpdateContactTopicsRequestTopicsItem> Topics { get; set; } =
        new List<UpdateContactTopicsRequestTopicsItem>();

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
