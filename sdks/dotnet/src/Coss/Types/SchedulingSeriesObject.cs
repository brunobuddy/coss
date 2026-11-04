using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingSeriesObject.SchedulingSeriesObjectSerializer))]
[Serializable]
public readonly record struct SchedulingSeriesObject : IStringEnum
{
    public static readonly SchedulingSeriesObject SchedulingSeries = new(Values.SchedulingSeries);

    public SchedulingSeriesObject(string value)
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
    public static SchedulingSeriesObject FromCustom(string value)
    {
        return new SchedulingSeriesObject(value);
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

    public static bool operator ==(SchedulingSeriesObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSeriesObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSeriesObject value) => value.Value;

    public static explicit operator SchedulingSeriesObject(string value) => new(value);

    internal class SchedulingSeriesObjectSerializer : JsonConverter<SchedulingSeriesObject>
    {
        public override SchedulingSeriesObject Read(
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
            return new SchedulingSeriesObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSeriesObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSeriesObject ReadAsPropertyName(
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
            return new SchedulingSeriesObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSeriesObject value,
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
        public const string SchedulingSeries = "scheduling.series";
    }
}
