using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Email;

[Serializable]
public record UpdateMarketingSettingsRequest
{
    /// <summary>
    /// The sender's name in the preference center. `null`: the organization's.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("display_name")]
    public Optional<string?> DisplayName { get; set; }

    /// <summary>
    /// The postal address every marketing email carries (CAN-SPAM). Marketing emails can't be sent without one.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("mailing_address")]
    public Optional<string?> MailingAddress { get; set; }

    /// <summary>
    /// Whether contacts upserted without `double_opt_in` must confirm first.
    /// </summary>
    [Optional]
    [JsonPropertyName("double_opt_in_default")]
    public bool? DoubleOptInDefault { get; set; }

    /// <summary>
    /// The sender of confirmation emails (a verified domain's address for live keys).
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmation_from")]
    public Optional<string?> ConfirmationFrom { get; set; }

    /// <summary>
    /// `null`: coss.com's default.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmation_subject")]
    public Optional<string?> ConfirmationSubject { get; set; }

    /// <summary>
    /// `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmation_html")]
    public Optional<string?> ConfirmationHtml { get; set; }

    /// <summary>
    /// `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmation_text")]
    public Optional<string?> ConfirmationText { get; set; }

    /// <summary>
    /// Where a confirmed contact is sent, an https URL. `null`: coss.com's own page.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("confirmed_redirect_url")]
    public Optional<string?> ConfirmedRedirectUrl { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
