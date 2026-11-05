using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingNotificationListObject.SchedulingBookingNotificationListObjectSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingNotificationListObject : IStringEnum
{
    public static readonly SchedulingBookingNotificationListObject List = new(Values.List);

    public SchedulingBookingNotificationListObject(string value)
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
    public static SchedulingBookingNotificationListObject FromCustom(string value)
    {
        return new SchedulingBookingNotificationListObject(value);
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

    public static bool operator ==(SchedulingBookingNotificationListObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingNotificationListObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingNotificationListObject value) =>
        value.Value;

    public static explicit operator SchedulingBookingNotificationListObject(string value) =>
        new(value);

    internal class SchedulingBookingNotificationListObjectSerializer
        : JsonConverter<SchedulingBookingNotificationListObject>
    {
        public override SchedulingBookingNotificationListObject Read(
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
            return new SchedulingBookingNotificationListObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationListObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingNotificationListObject ReadAsPropertyName(
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
            return new SchedulingBookingNotificationListObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationListObject value,
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
