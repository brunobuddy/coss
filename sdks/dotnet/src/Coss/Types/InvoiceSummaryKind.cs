using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(InvoiceSummaryKind.InvoiceSummaryKindSerializer))]
[Serializable]
public readonly record struct InvoiceSummaryKind : IStringEnum
{
    public static readonly InvoiceSummaryKind Period = new(Values.Period);

    public static readonly InvoiceSummaryKind PlanChange = new(Values.PlanChange);

    public static readonly InvoiceSummaryKind OneOff = new(Values.OneOff);

    public static readonly InvoiceSummaryKind Final = new(Values.Final);

    public static readonly InvoiceSummaryKind Threshold = new(Values.Threshold);

    public InvoiceSummaryKind(string value)
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
    public static InvoiceSummaryKind FromCustom(string value)
    {
        return new InvoiceSummaryKind(value);
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

    public static bool operator ==(InvoiceSummaryKind value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(InvoiceSummaryKind value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(InvoiceSummaryKind value) => value.Value;

    public static explicit operator InvoiceSummaryKind(string value) => new(value);

    internal class InvoiceSummaryKindSerializer : JsonConverter<InvoiceSummaryKind>
    {
        public override InvoiceSummaryKind Read(
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
            return new InvoiceSummaryKind(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            InvoiceSummaryKind value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override InvoiceSummaryKind ReadAsPropertyName(
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
            return new InvoiceSummaryKind(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            InvoiceSummaryKind value,
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
        public const string Period = "period";

        public const string PlanChange = "plan_change";

        public const string OneOff = "one_off";

        public const string Final = "final";

        public const string Threshold = "threshold";
    }
}
