using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingReminderSendItem.SchedulingReminderSendItemSerializer))]
[Serializable]
public readonly record struct SchedulingReminderSendItem : IStringEnum
{
    public static readonly SchedulingReminderSendItem EmailAttendee = new(Values.EmailAttendee);

    public static readonly SchedulingReminderSendItem EmailHost = new(Values.EmailHost);

    public static readonly SchedulingReminderSendItem SmsAttendee = new(Values.SmsAttendee);

    public static readonly SchedulingReminderSendItem SmsHost = new(Values.SmsHost);

    public static readonly SchedulingReminderSendItem Webhook = new(Values.Webhook);

    public SchedulingReminderSendItem(string value)
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
    public static SchedulingReminderSendItem FromCustom(string value)
    {
        return new SchedulingReminderSendItem(value);
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

    public static bool operator ==(SchedulingReminderSendItem value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingReminderSendItem value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingReminderSendItem value) => value.Value;

    public static explicit operator SchedulingReminderSendItem(string value) => new(value);

    internal class SchedulingReminderSendItemSerializer : JsonConverter<SchedulingReminderSendItem>
    {
        public override SchedulingReminderSendItem Read(
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
            return new SchedulingReminderSendItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingReminderSendItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingReminderSendItem ReadAsPropertyName(
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
            return new SchedulingReminderSendItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingReminderSendItem value,
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
        public const string EmailAttendee = "email_attendee";

        public const string EmailHost = "email_host";

        public const string SmsAttendee = "sms_attendee";

        public const string SmsHost = "sms_host";

        public const string Webhook = "webhook";
    }
}
