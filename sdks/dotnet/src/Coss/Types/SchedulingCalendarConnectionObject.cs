using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarConnectionObject.SchedulingCalendarConnectionObjectSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarConnectionObject : IStringEnum
{
    public static readonly SchedulingCalendarConnectionObject SchedulingCalendarConnection = new(
        Values.SchedulingCalendarConnection
    );

    public SchedulingCalendarConnectionObject(string value)
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
    public static SchedulingCalendarConnectionObject FromCustom(string value)
    {
        return new SchedulingCalendarConnectionObject(value);
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

    public static bool operator ==(SchedulingCalendarConnectionObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarConnectionObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarConnectionObject value) => value.Value;

    public static explicit operator SchedulingCalendarConnectionObject(string value) => new(value);

    internal class SchedulingCalendarConnectionObjectSerializer
        : JsonConverter<SchedulingCalendarConnectionObject>
    {
        public override SchedulingCalendarConnectionObject Read(
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
            return new SchedulingCalendarConnectionObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarConnectionObject ReadAsPropertyName(
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
            return new SchedulingCalendarConnectionObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionObject value,
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
        public const string SchedulingCalendarConnection = "scheduling.calendar_connection";
    }
}
