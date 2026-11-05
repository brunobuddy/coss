using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(BillingWebhookEventFourDataReason.BillingWebhookEventFourDataReasonSerializer)
)]
[Serializable]
public readonly record struct BillingWebhookEventFourDataReason : IStringEnum
{
    public static readonly BillingWebhookEventFourDataReason Delinquent = new(Values.Delinquent);

    public static readonly BillingWebhookEventFourDataReason SpendLimit = new(Values.SpendLimit);

    public static readonly BillingWebhookEventFourDataReason CreditLimit = new(Values.CreditLimit);

    public static readonly BillingWebhookEventFourDataReason Admin = new(Values.Admin);

    public BillingWebhookEventFourDataReason(string value)
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
    public static BillingWebhookEventFourDataReason FromCustom(string value)
    {
        return new BillingWebhookEventFourDataReason(value);
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

    public static bool operator ==(BillingWebhookEventFourDataReason value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(BillingWebhookEventFourDataReason value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(BillingWebhookEventFourDataReason value) => value.Value;

    public static explicit operator BillingWebhookEventFourDataReason(string value) => new(value);

    internal class BillingWebhookEventFourDataReasonSerializer
        : JsonConverter<BillingWebhookEventFourDataReason>
    {
        public override BillingWebhookEventFourDataReason Read(
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
            return new BillingWebhookEventFourDataReason(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            BillingWebhookEventFourDataReason value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override BillingWebhookEventFourDataReason ReadAsPropertyName(
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
            return new BillingWebhookEventFourDataReason(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            BillingWebhookEventFourDataReason value,
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
        public const string Delinquent = "delinquent";

        public const string SpendLimit = "spend_limit";

        public const string CreditLimit = "credit_limit";

        public const string Admin = "admin";
    }
}
