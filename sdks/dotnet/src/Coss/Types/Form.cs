using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record Form : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required FormObject Object { get; set; }

    [JsonPropertyName("id")]
    public required string Id { get; set; }

    /// <summary>
    /// Your name for the form, shown in the dashboard and in notifications.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; set; }

    /// <summary>
    /// `false`: submissions are refused.
    /// </summary>
    [JsonPropertyName("enabled")]
    public required bool Enabled { get; set; }

    /// <summary>
    /// Where the form posts: `&lt;form action=…&gt;`.
    /// </summary>
    [JsonPropertyName("endpoint")]
    public required string Endpoint { get; set; }

    /// <summary>
    /// The hosted page, when `hosted.enabled`; `null` otherwise.
    /// </summary>
    [Nullable]
    [JsonPropertyName("hosted_url")]
    public string? HostedUrl { get; set; }

    /// <summary>
    /// The form's fields. `null`: any field is accepted, without validation.
    /// </summary>
    [Nullable]
    [JsonPropertyName("fields")]
    public IEnumerable<FormField>? Fields { get; set; }

    /// <summary>
    /// With `fields`: whether fields the form doesn't define are refused.
    /// </summary>
    [JsonPropertyName("strict_fields")]
    public required bool StrictFields { get; set; }

    /// <summary>
    /// Sites that may post to the form. Empty: any.
    /// </summary>
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string> AllowedOrigins { get; set; } = new List<string>();

    /// <summary>
    /// Where browsers go after an HTML post. `null`: coss.com's thank-you page.
    /// </summary>
    [Nullable]
    [JsonPropertyName("redirect_url")]
    public string? RedirectUrl { get; set; }

    /// <summary>
    /// How submissions are screened.
    /// </summary>
    [JsonPropertyName("spam")]
    public required FormSpam Spam { get; set; }

    /// <summary>
    /// Who the submitter is, and whether they must confirm by email.
    /// </summary>
    [JsonPropertyName("submitter")]
    public required FormSubmitter Submitter { get; set; }

    /// <summary>
    /// Emails about accepted submissions.
    /// </summary>
    [JsonPropertyName("notifications")]
    public required FormNotifications Notifications { get; set; }

    /// <summary>
    /// Turning submissions into contacts.
    /// </summary>
    [JsonPropertyName("contacts")]
    public required FormContacts Contacts { get; set; }

    /// <summary>
    /// File uploads.
    /// </summary>
    [JsonPropertyName("files")]
    public required FormFiles Files { get; set; }

    /// <summary>
    /// The page coss.com can serve for this form.
    /// </summary>
    [JsonPropertyName("hosted")]
    public required FormHosted Hosted { get; set; }

    /// <summary>
    /// coss.com disabled the form for abuse; contact support.
    /// </summary>
    [JsonPropertyName("disabled_by_admin")]
    public required bool DisabledByAdmin { get; set; }

    /// <summary>
    /// Whether the form belongs to a sandbox environment.
    /// </summary>
    [JsonPropertyName("sandbox")]
    public required bool Sandbox { get; set; }

    [JsonPropertyName("created_at")]
    public required DateTime CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public required DateTime UpdatedAt { get; set; }

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
