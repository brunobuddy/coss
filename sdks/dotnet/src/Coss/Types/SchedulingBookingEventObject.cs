using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingEventObject.SchedulingBookingEventObjectSerializer))]
[Serializable]
public readonly record struct SchedulingBookingEventObject : IStringEnum
{
    public static readonly SchedulingBookingEventObject SchedulingBookingEvent = new(
        Values.SchedulingBookingEvent
    );

    public SchedulingBookingEventObject(string value)
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
    public static SchedulingBookingEventObject FromCustom(string value)
    {
        return new SchedulingBookingEventObject(value);
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

    public static bool operator ==(SchedulingBookingEventObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingEventObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingEventObject value) => value.Value;

    public static explicit operator SchedulingBookingEventObject(string value) => new(value);

    internal class SchedulingBookingEventObjectSerializer
        : JsonConverter<SchedulingBookingEventObject>
    {
        public override SchedulingBookingEventObject Read(
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
            return new SchedulingBookingEventObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingEventObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingEventObject ReadAsPropertyName(
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
            return new SchedulingBookingEventObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingEventObject value,
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
        public const string SchedulingBookingEvent = "scheduling.booking_event";
    }
}
