using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(InvoiceKind.InvoiceKindSerializer))]
[Serializable]
public readonly record struct InvoiceKind : IStringEnum
{
    public static readonly InvoiceKind Period = new(Values.Period);

    public static readonly InvoiceKind PlanChange = new(Values.PlanChange);

    public static readonly InvoiceKind OneOff = new(Values.OneOff);

    public static readonly InvoiceKind Final = new(Values.Final);

    public static readonly InvoiceKind Threshold = new(Values.Threshold);

    public InvoiceKind(string value)
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
    public static InvoiceKind FromCustom(string value)
    {
        return new InvoiceKind(value);
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

    public static bool operator ==(InvoiceKind value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(InvoiceKind value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(InvoiceKind value) => value.Value;

    public static explicit operator InvoiceKind(string value) => new(value);

    internal class InvoiceKindSerializer : JsonConverter<InvoiceKind>
    {
        public override InvoiceKind Read(
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
            return new InvoiceKind(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            InvoiceKind value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override InvoiceKind ReadAsPropertyName(
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
            return new InvoiceKind(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            InvoiceKind value,
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
