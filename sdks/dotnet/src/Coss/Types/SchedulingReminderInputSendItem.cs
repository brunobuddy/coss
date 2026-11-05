using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingReminderInputSendItem.SchedulingReminderInputSendItemSerializer))]
[Serializable]
public readonly record struct SchedulingReminderInputSendItem : IStringEnum
{
    public static readonly SchedulingReminderInputSendItem EmailAttendee = new(
        Values.EmailAttendee
    );

    public static readonly SchedulingReminderInputSendItem EmailHost = new(Values.EmailHost);

    public static readonly SchedulingReminderInputSendItem SmsAttendee = new(Values.SmsAttendee);

    public static readonly SchedulingReminderInputSendItem SmsHost = new(Values.SmsHost);

    public static readonly SchedulingReminderInputSendItem Webhook = new(Values.Webhook);

    public SchedulingReminderInputSendItem(string value)
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
    public static SchedulingReminderInputSendItem FromCustom(string value)
    {
        return new SchedulingReminderInputSendItem(value);
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

    public static bool operator ==(SchedulingReminderInputSendItem value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingReminderInputSendItem value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingReminderInputSendItem value) => value.Value;

    public static explicit operator SchedulingReminderInputSendItem(string value) => new(value);

    internal class SchedulingReminderInputSendItemSerializer
        : JsonConverter<SchedulingReminderInputSendItem>
    {
        public override SchedulingReminderInputSendItem Read(
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
            return new SchedulingReminderInputSendItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingReminderInputSendItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingReminderInputSendItem ReadAsPropertyName(
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
            return new SchedulingReminderInputSendItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingReminderInputSendItem value,
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
