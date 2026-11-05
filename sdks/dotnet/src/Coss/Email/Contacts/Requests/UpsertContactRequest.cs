using Coss.Core;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss.Email;

[Serializable]
public record UpsertContactRequest
{
    /// <summary>
    /// The contact's address. Display names are ignored; matching is case-insensitive.
    /// </summary>
    [JsonPropertyName("email")]
    public required string Email { get; set; }

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
    public UpsertContactRequestStatus? Status { get; set; }

    /// <summary>
    /// Audiences to add the contact to (it stays in the others).
    /// </summary>
    [Optional]
    [JsonPropertyName("audience_ids")]
    public IEnumerable<string>? AudienceIds { get; set; }

    /// <summary>
    /// Choices per topic; topics left out keep the contact's choice.
    /// </summary>
    [Optional]
    [JsonPropertyName("topics")]
    public IEnumerable<UpsertContactRequestTopicsItem>? Topics { get; set; }

    /// <summary>
    /// Ask the contact to confirm first (default: the marketing settings' `double_opt_in_default`): a new or unsubscribed contact becomes `pending` and gets a confirmation email; it is `subscribed` once they click its link. Can't be combined with `status: "subscribed"`, nor can the default (pass `false` to subscribe directly).
    /// </summary>
    [Optional]
    [JsonPropertyName("double_opt_in")]
    public bool? DoubleOptIn { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
