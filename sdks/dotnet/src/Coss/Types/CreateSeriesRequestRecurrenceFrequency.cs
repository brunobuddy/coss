using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(CreateSeriesRequestRecurrenceFrequency.CreateSeriesRequestRecurrenceFrequencySerializer)
)]
[Serializable]
public readonly record struct CreateSeriesRequestRecurrenceFrequency : IStringEnum
{
    public static readonly CreateSeriesRequestRecurrenceFrequency Weekly = new(Values.Weekly);

    public static readonly CreateSeriesRequestRecurrenceFrequency Monthly = new(Values.Monthly);

    public CreateSeriesRequestRecurrenceFrequency(string value)
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
    public static CreateSeriesRequestRecurrenceFrequency FromCustom(string value)
    {
        return new CreateSeriesRequestRecurrenceFrequency(value);
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

    public static bool operator ==(CreateSeriesRequestRecurrenceFrequency value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(CreateSeriesRequestRecurrenceFrequency value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(CreateSeriesRequestRecurrenceFrequency value) =>
        value.Value;

    public static explicit operator CreateSeriesRequestRecurrenceFrequency(string value) =>
        new(value);

    internal class CreateSeriesRequestRecurrenceFrequencySerializer
        : JsonConverter<CreateSeriesRequestRecurrenceFrequency>
    {
        public override CreateSeriesRequestRecurrenceFrequency Read(
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
            return new CreateSeriesRequestRecurrenceFrequency(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateSeriesRequestRecurrenceFrequency value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateSeriesRequestRecurrenceFrequency ReadAsPropertyName(
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
            return new CreateSeriesRequestRecurrenceFrequency(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateSeriesRequestRecurrenceFrequency value,
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
        public const string Weekly = "weekly";

        public const string Monthly = "monthly";
    }
}
