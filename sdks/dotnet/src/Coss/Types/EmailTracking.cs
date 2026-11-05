using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Open and click tracking, as resolved when the email was sent, with engagement so far. Opens can be inflated by mail clients that prefetch images, clicks by link scanners.
/// </summary>
[Serializable]
public record EmailTracking : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    /// <summary>
    /// Whether opens are tracked for this email.
    /// </summary>
    [JsonPropertyName("opens")]
    public required bool Opens { get; set; }

    /// <summary>
    /// Whether link clicks are tracked for this email.
    /// </summary>
    [JsonPropertyName("clicks")]
    public required bool Clicks { get; set; }

    /// <summary>
    /// Whether the email carries one-click unsubscribe headers (RFC 8058).
    /// </summary>
    [JsonPropertyName("unsubscribe")]
    public required bool Unsubscribe { get; set; }

    /// <summary>
    /// Times opened. Mail clients that prefetch images inflate it.
    /// </summary>
    [JsonPropertyName("open_count")]
    public required long OpenCount { get; set; }

    /// <summary>
    /// When it was first opened. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("first_opened_at")]
    public DateTime? FirstOpenedAt { get; set; }

    /// <summary>
    /// When it was last opened. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_opened_at")]
    public DateTime? LastOpenedAt { get; set; }

    /// <summary>
    /// Link clicks. Link scanners inflate it.
    /// </summary>
    [JsonPropertyName("click_count")]
    public required long ClickCount { get; set; }

    /// <summary>
    /// When a link was first clicked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("first_clicked_at")]
    public DateTime? FirstClickedAt { get; set; }

    /// <summary>
    /// When a link was last clicked. `null`: not yet.
    /// </summary>
    [Nullable]
    [JsonPropertyName("last_clicked_at")]
    public DateTime? LastClickedAt { get; set; }

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
