using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingEventTypeObject.SchedulingEventTypeObjectSerializer))]
[Serializable]
public readonly record struct SchedulingEventTypeObject : IStringEnum
{
    public static readonly SchedulingEventTypeObject SchedulingEventType = new(
        Values.SchedulingEventType
    );

    public SchedulingEventTypeObject(string value)
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
    public static SchedulingEventTypeObject FromCustom(string value)
    {
        return new SchedulingEventTypeObject(value);
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

    public static bool operator ==(SchedulingEventTypeObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeObject value) => value.Value;

    public static explicit operator SchedulingEventTypeObject(string value) => new(value);

    internal class SchedulingEventTypeObjectSerializer : JsonConverter<SchedulingEventTypeObject>
    {
        public override SchedulingEventTypeObject Read(
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
            return new SchedulingEventTypeObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeObject ReadAsPropertyName(
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
            return new SchedulingEventTypeObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeObject value,
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
        public const string SchedulingEventType = "scheduling.event_type";
    }
}
