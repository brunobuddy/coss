using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingNotificationRecipient.SchedulingBookingNotificationRecipientSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingNotificationRecipient : IStringEnum
{
    public static readonly SchedulingBookingNotificationRecipient Attendee = new(Values.Attendee);

    public static readonly SchedulingBookingNotificationRecipient Host = new(Values.Host);

    public static readonly SchedulingBookingNotificationRecipient Endpoint = new(Values.Endpoint);

    public static readonly SchedulingBookingNotificationRecipient Address = new(Values.Address);

    public SchedulingBookingNotificationRecipient(string value)
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
    public static SchedulingBookingNotificationRecipient FromCustom(string value)
    {
        return new SchedulingBookingNotificationRecipient(value);
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

    public static bool operator ==(SchedulingBookingNotificationRecipient value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingNotificationRecipient value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingNotificationRecipient value) =>
        value.Value;

    public static explicit operator SchedulingBookingNotificationRecipient(string value) =>
        new(value);

    internal class SchedulingBookingNotificationRecipientSerializer
        : JsonConverter<SchedulingBookingNotificationRecipient>
    {
        public override SchedulingBookingNotificationRecipient Read(
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
            return new SchedulingBookingNotificationRecipient(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationRecipient value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingNotificationRecipient ReadAsPropertyName(
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
            return new SchedulingBookingNotificationRecipient(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationRecipient value,
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
        public const string Attendee = "attendee";

        public const string Host = "host";

        public const string Endpoint = "endpoint";

        public const string Address = "address";
    }
}
