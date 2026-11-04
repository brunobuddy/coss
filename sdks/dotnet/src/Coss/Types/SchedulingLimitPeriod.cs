using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingLimitPeriod.SchedulingLimitPeriodSerializer))]
[Serializable]
public readonly record struct SchedulingLimitPeriod : IStringEnum
{
    public static readonly SchedulingLimitPeriod Day = new(Values.Day);

    public static readonly SchedulingLimitPeriod Week = new(Values.Week);

    public SchedulingLimitPeriod(string value)
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
    public static SchedulingLimitPeriod FromCustom(string value)
    {
        return new SchedulingLimitPeriod(value);
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

    public static bool operator ==(SchedulingLimitPeriod value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingLimitPeriod value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingLimitPeriod value) => value.Value;

    public static explicit operator SchedulingLimitPeriod(string value) => new(value);

    internal class SchedulingLimitPeriodSerializer : JsonConverter<SchedulingLimitPeriod>
    {
        public override SchedulingLimitPeriod Read(
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
            return new SchedulingLimitPeriod(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingLimitPeriod value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingLimitPeriod ReadAsPropertyName(
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
            return new SchedulingLimitPeriod(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingLimitPeriod value,
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
        public const string Day = "day";

        public const string Week = "week";
    }
}
