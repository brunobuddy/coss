using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Email;

[Serializable]
public record UpdateContactRequest
{
    /// <summary>
    /// The contact's id, or its address (URL-encoded).
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Their first name. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("first_name")]
    public Optional<string?> FirstName { get; set; }

    /// <summary>
    /// Their last name. `null` removes it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("last_name")]
    public Optional<string?> LastName { get; set; }

    /// <summary>
    /// Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
    /// </summary>
    [Optional]
    [JsonPropertyName("properties")]
    public Dictionary<string, OneOf<string, double, bool>?>? Properties { get; set; }

    /// <summary>
    /// Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
    /// </summary>
    [Optional]
    [JsonPropertyName("status")]
    public UpdateContactRequestStatus? Status { get; set; }

    [Optional]
    [JsonPropertyName("topics")]
    public IEnumerable<UpdateContactRequestTopicsItem>? Topics { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
