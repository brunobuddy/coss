using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingNotificationChannel.SchedulingBookingNotificationChannelSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingNotificationChannel : IStringEnum
{
    public static readonly SchedulingBookingNotificationChannel Email = new(Values.Email);

    public static readonly SchedulingBookingNotificationChannel Sms = new(Values.Sms);

    public static readonly SchedulingBookingNotificationChannel Webhook = new(Values.Webhook);

    public SchedulingBookingNotificationChannel(string value)
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
    public static SchedulingBookingNotificationChannel FromCustom(string value)
    {
        return new SchedulingBookingNotificationChannel(value);
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

    public static bool operator ==(SchedulingBookingNotificationChannel value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingNotificationChannel value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingNotificationChannel value) =>
        value.Value;

    public static explicit operator SchedulingBookingNotificationChannel(string value) =>
        new(value);

    internal class SchedulingBookingNotificationChannelSerializer
        : JsonConverter<SchedulingBookingNotificationChannel>
    {
        public override SchedulingBookingNotificationChannel Read(
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
            return new SchedulingBookingNotificationChannel(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationChannel value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingNotificationChannel ReadAsPropertyName(
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
            return new SchedulingBookingNotificationChannel(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingNotificationChannel value,
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
        public const string Email = "email";

        public const string Sms = "sms";

        public const string Webhook = "webhook";
    }
}
