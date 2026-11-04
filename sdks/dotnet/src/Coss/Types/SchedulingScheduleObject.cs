using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingScheduleObject.SchedulingScheduleObjectSerializer))]
[Serializable]
public readonly record struct SchedulingScheduleObject : IStringEnum
{
    public static readonly SchedulingScheduleObject SchedulingSchedule = new(
        Values.SchedulingSchedule
    );

    public SchedulingScheduleObject(string value)
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
    public static SchedulingScheduleObject FromCustom(string value)
    {
        return new SchedulingScheduleObject(value);
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

    public static bool operator ==(SchedulingScheduleObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingScheduleObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingScheduleObject value) => value.Value;

    public static explicit operator SchedulingScheduleObject(string value) => new(value);

    internal class SchedulingScheduleObjectSerializer : JsonConverter<SchedulingScheduleObject>
    {
        public override SchedulingScheduleObject Read(
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
            return new SchedulingScheduleObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingScheduleObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingScheduleObject ReadAsPropertyName(
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
            return new SchedulingScheduleObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingScheduleObject value,
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
        public const string SchedulingSchedule = "scheduling.schedule";
    }
}
