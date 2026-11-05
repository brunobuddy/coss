using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(BillingOverviewHoldsItemReason.BillingOverviewHoldsItemReasonSerializer))]
[Serializable]
public readonly record struct BillingOverviewHoldsItemReason : IStringEnum
{
    public static readonly BillingOverviewHoldsItemReason Delinquent = new(Values.Delinquent);

    public static readonly BillingOverviewHoldsItemReason SpendLimit = new(Values.SpendLimit);

    public static readonly BillingOverviewHoldsItemReason CreditLimit = new(Values.CreditLimit);

    public static readonly BillingOverviewHoldsItemReason Admin = new(Values.Admin);

    public BillingOverviewHoldsItemReason(string value)
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
    public static BillingOverviewHoldsItemReason FromCustom(string value)
    {
        return new BillingOverviewHoldsItemReason(value);
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

    public static bool operator ==(BillingOverviewHoldsItemReason value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(BillingOverviewHoldsItemReason value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(BillingOverviewHoldsItemReason value) => value.Value;

    public static explicit operator BillingOverviewHoldsItemReason(string value) => new(value);

    internal class BillingOverviewHoldsItemReasonSerializer
        : JsonConverter<BillingOverviewHoldsItemReason>
    {
        public override BillingOverviewHoldsItemReason Read(
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
            return new BillingOverviewHoldsItemReason(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            BillingOverviewHoldsItemReason value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override BillingOverviewHoldsItemReason ReadAsPropertyName(
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
            return new BillingOverviewHoldsItemReason(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            BillingOverviewHoldsItemReason value,
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
