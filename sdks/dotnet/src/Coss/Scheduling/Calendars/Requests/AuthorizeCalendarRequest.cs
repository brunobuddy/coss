using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[Serializable]
public record AuthorizeCalendarRequest
{
    /// <summary>
    /// The host's id or uid.
    /// </summary>
    [JsonIgnore]
    public required string Host { get; set; }

    /// <summary>
    /// Whose consent page to open. CalDAV connects with a password instead.
    /// </summary>
    [JsonPropertyName("provider")]
    public required AuthorizeCalendarRequestProvider Provider { get; set; }

    /// <summary>
    /// Where to send the browser afterwards, on one of the environment's allowed origins. `coss_calendar` says what happened: `connected`, `denied` or `invalid`.
    /// </summary>
    [Optional]
    [JsonPropertyName("return_url")]
    public string? ReturnUrl { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
