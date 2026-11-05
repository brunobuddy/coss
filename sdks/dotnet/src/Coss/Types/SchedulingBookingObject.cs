using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingObject.SchedulingBookingObjectSerializer))]
[Serializable]
public readonly record struct SchedulingBookingObject : IStringEnum
{
    public static readonly SchedulingBookingObject SchedulingBooking = new(
        Values.SchedulingBooking
    );

    public SchedulingBookingObject(string value)
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
    public static SchedulingBookingObject FromCustom(string value)
    {
        return new SchedulingBookingObject(value);
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

    public static bool operator ==(SchedulingBookingObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingObject value) => value.Value;

    public static explicit operator SchedulingBookingObject(string value) => new(value);

    internal class SchedulingBookingObjectSerializer : JsonConverter<SchedulingBookingObject>
    {
        public override SchedulingBookingObject Read(
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
            return new SchedulingBookingObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingObject ReadAsPropertyName(
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
            return new SchedulingBookingObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingObject value,
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
        public const string SchedulingBooking = "scheduling.booking";
    }
}
