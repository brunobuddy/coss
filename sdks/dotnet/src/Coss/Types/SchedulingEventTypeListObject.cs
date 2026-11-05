using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingEventTypeListObject.SchedulingEventTypeListObjectSerializer))]
[Serializable]
public readonly record struct SchedulingEventTypeListObject : IStringEnum
{
    public static readonly SchedulingEventTypeListObject List = new(Values.List);

    public SchedulingEventTypeListObject(string value)
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
    public static SchedulingEventTypeListObject FromCustom(string value)
    {
        return new SchedulingEventTypeListObject(value);
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

    public static bool operator ==(SchedulingEventTypeListObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeListObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeListObject value) => value.Value;

    public static explicit operator SchedulingEventTypeListObject(string value) => new(value);

    internal class SchedulingEventTypeListObjectSerializer
        : JsonConverter<SchedulingEventTypeListObject>
    {
        public override SchedulingEventTypeListObject Read(
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
            return new SchedulingEventTypeListObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeListObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeListObject ReadAsPropertyName(
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
            return new SchedulingEventTypeListObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeListObject value,
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
