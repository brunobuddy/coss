using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(RiskAssessmentDegradedItem.RiskAssessmentDegradedItemSerializer))]
[Serializable]
public readonly record struct RiskAssessmentDegradedItem : IStringEnum
{
    public static readonly RiskAssessmentDegradedItem EmailDns = new(Values.EmailDns);

    public static readonly RiskAssessmentDegradedItem DomainAge = new(Values.DomainAge);

    public static readonly RiskAssessmentDegradedItem IpData = new(Values.IpData);

    public static readonly RiskAssessmentDegradedItem Velocity = new(Values.Velocity);

    public static readonly RiskAssessmentDegradedItem Captcha = new(Values.Captcha);

    public static readonly RiskAssessmentDegradedItem Content = new(Values.Content);

    public static readonly RiskAssessmentDegradedItem IpPrivacy = new(Values.IpPrivacy);

    public static readonly RiskAssessmentDegradedItem UsageLimit = new(Values.UsageLimit);

    public RiskAssessmentDegradedItem(string value)
    {
        Value = value;
    }

    /// <summary>
    /// The string value of the enum.
    /// </summary>
    public string Value { get; }

    /// <summary>
    /// Create a string enum with the given value.
    /// </summary>
    public static RiskAssessmentDegradedItem FromCustom(string value)
    {
        return new RiskAssessmentDegradedItem(value);
    }

    public bool Equals(string? other)
    {
        return Value.Equals(other);
    }

    /// <summary>
    /// Returns the string value of the enum.
    /// </summary>
    public override string ToString()
    {
        return Value;
    }

    public static bool operator ==(RiskAssessmentDegradedItem value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(RiskAssessmentDegradedItem value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(RiskAssessmentDegradedItem value) => value.Value;

    public static explicit operator RiskAssessmentDegradedItem(string value) => new(value);

    internal class RiskAssessmentDegradedItemSerializer : JsonConverter<RiskAssessmentDegradedItem>
    {
        public override RiskAssessmentDegradedItem Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON value could not be read as a string."
                );
            return new RiskAssessmentDegradedItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            RiskAssessmentDegradedItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override RiskAssessmentDegradedItem ReadAsPropertyName(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON property name could not be read as a string."
                );
            return new RiskAssessmentDegradedItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            RiskAssessmentDegradedItem value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Value);
        }
    }

    /// <summary>
    /// Constant strings for enum values
    /// </summary>
    [Serializable]
    public static class Values
    {
        public const string EmailDns = "email_dns";

        public const string DomainAge = "domain_age";

        public const string IpData = "ip_data";

        public const string Velocity = "velocity";

        public const string Captcha = "captcha";

        public const string Content = "content";

        public const string IpPrivacy = "ip_privacy";

        public const string UsageLimit = "usage_limit";
    }
}
