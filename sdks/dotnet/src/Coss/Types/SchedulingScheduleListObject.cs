using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingScheduleListObject.SchedulingScheduleListObjectSerializer))]
[Serializable]
public readonly record struct SchedulingScheduleListObject : IStringEnum
{
    public static readonly SchedulingScheduleListObject List = new(Values.List);

    public SchedulingScheduleListObject(string value)
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
    public static SchedulingScheduleListObject FromCustom(string value)
    {
        return new SchedulingScheduleListObject(value);
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

    public static bool operator ==(SchedulingScheduleListObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingScheduleListObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingScheduleListObject value) => value.Value;

    public static explicit operator SchedulingScheduleListObject(string value) => new(value);

    internal class SchedulingScheduleListObjectSerializer
        : JsonConverter<SchedulingScheduleListObject>
    {
        public override SchedulingScheduleListObject Read(
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
            return new SchedulingScheduleListObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingScheduleListObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingScheduleListObject ReadAsPropertyName(
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
            return new SchedulingScheduleListObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingScheduleListObject value,
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
        public const string List = "list";
    }
}
