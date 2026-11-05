using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingAttendeeErasureObject.SchedulingAttendeeErasureObjectSerializer))]
[Serializable]
public readonly record struct SchedulingAttendeeErasureObject : IStringEnum
{
    public static readonly SchedulingAttendeeErasureObject SchedulingAttendeeErasure = new(
        Values.SchedulingAttendeeErasure
    );

    public SchedulingAttendeeErasureObject(string value)
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
    public static SchedulingAttendeeErasureObject FromCustom(string value)
    {
        return new SchedulingAttendeeErasureObject(value);
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

    public static bool operator ==(SchedulingAttendeeErasureObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingAttendeeErasureObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingAttendeeErasureObject value) => value.Value;

    public static explicit operator SchedulingAttendeeErasureObject(string value) => new(value);

    internal class SchedulingAttendeeErasureObjectSerializer
        : JsonConverter<SchedulingAttendeeErasureObject>
    {
        public override SchedulingAttendeeErasureObject Read(
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
            return new SchedulingAttendeeErasureObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingAttendeeErasureObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingAttendeeErasureObject ReadAsPropertyName(
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
            return new SchedulingAttendeeErasureObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingAttendeeErasureObject value,
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
        public const string SchedulingAttendeeErasure = "scheduling.attendee_erasure";
    }
}
