using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss.Sms_;

[Serializable]
public record CreateSmsSuppressionRequest
{
    /// <summary>
    /// The number to suppress, in E.164.
    /// </summary>
    [JsonPropertyName("phone_number")]
    public required string PhoneNumber { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
