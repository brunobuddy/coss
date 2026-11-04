using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(CreditSource.CreditSourceSerializer))]
[Serializable]
public readonly record struct CreditSource : IStringEnum
{
    public static readonly CreditSource Fee = new(Values.Fee);

    public static readonly CreditSource Commitment = new(Values.Commitment);

    public static readonly CreditSource Support = new(Values.Support);

    public static readonly CreditSource Promotion = new(Values.Promotion);

    public static readonly CreditSource Refund = new(Values.Refund);

    public static readonly CreditSource Sla = new(Values.Sla);

    public static readonly CreditSource Threshold = new(Values.Threshold);

    public CreditSource(string value)
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
    public static CreditSource FromCustom(string value)
    {
        return new CreditSource(value);
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

    public static bool operator ==(CreditSource value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(CreditSource value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(CreditSource value) => value.Value;

    public static explicit operator CreditSource(string value) => new(value);

    internal class CreditSourceSerializer : JsonConverter<CreditSource>
    {
        public override CreditSource Read(
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
            return new CreditSource(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreditSource value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreditSource ReadAsPropertyName(
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
            return new CreditSource(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreditSource value,
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
        public const string Fee = "fee";

        public const string Commitment = "commitment";

        public const string Support = "support";

        public const string Promotion = "promotion";

        public const string Refund = "refund";

        public const string Sla = "sla";

        public const string Threshold = "threshold";
    }
}
