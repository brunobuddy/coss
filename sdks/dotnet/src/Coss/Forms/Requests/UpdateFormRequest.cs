using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record UpdateFormRequest
{
    /// <summary>
    /// The form's id.
    /// </summary>
    [JsonIgnore]
    public required string Id { get; set; }

    /// <summary>
    /// Your name for the form, shown in the dashboard and in notifications.
    /// </summary>
    [Optional]
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    /// <summary>
    /// `false`: submissions are refused.
    /// </summary>
    [Optional]
    [JsonPropertyName("enabled")]
    public bool? Enabled { get; set; }

    /// <summary>
    /// The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("fields")]
    public Optional<IEnumerable<FormFieldInput>?> Fields { get; set; }

    /// <summary>
    /// With `fields`: refuse fields the form doesn't define. Default false.
    /// </summary>
    [Optional]
    [JsonPropertyName("strict_fields")]
    public bool? StrictFields { get; set; }

    /// <summary>
    /// Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:&lt;port&gt;`). Empty (default): any.
    /// </summary>
    [Optional]
    [JsonPropertyName("allowed_origins")]
    public IEnumerable<string>? AllowedOrigins { get; set; }

    /// <summary>
    /// Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("redirect_url")]
    public Optional<string?> RedirectUrl { get; set; }

    /// <summary>
    /// How submissions are screened. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("spam")]
    public UpdateFormRequestSpam? Spam { get; set; }

    /// <summary>
    /// Who the submitter is, and whether they must confirm by email. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("submitter")]
    public UpdateFormRequestSubmitter? Submitter { get; set; }

    /// <summary>
    /// Emails about accepted submissions. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("notifications")]
    public UpdateFormRequestNotifications? Notifications { get; set; }

    /// <summary>
    /// Turning submissions into contacts. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("contacts")]
    public UpdateFormRequestContacts? Contacts { get; set; }

    /// <summary>
    /// File uploads. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("files")]
    public UpdateFormRequestFiles? Files { get; set; }

    /// <summary>
    /// The page coss.com can serve for this form. Only the fields given change.
    /// </summary>
    [Optional]
    [JsonPropertyName("hosted")]
    public UpdateFormRequestHosted? Hosted { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
