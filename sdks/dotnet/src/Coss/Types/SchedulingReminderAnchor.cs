using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingReminderAnchor.SchedulingReminderAnchorSerializer))]
[Serializable]
public readonly record struct SchedulingReminderAnchor : IStringEnum
{
    public static readonly SchedulingReminderAnchor Start = new(Values.Start);

    public static readonly SchedulingReminderAnchor End = new(Values.End);

    public static readonly SchedulingReminderAnchor Confirmed = new(Values.Confirmed);

    public static readonly SchedulingReminderAnchor Rescheduled = new(Values.Rescheduled);

    public static readonly SchedulingReminderAnchor Cancelled = new(Values.Cancelled);

    public static readonly SchedulingReminderAnchor Declined = new(Values.Declined);

    public static readonly SchedulingReminderAnchor PendingApproval = new(Values.PendingApproval);

    public static readonly SchedulingReminderAnchor NoShow = new(Values.NoShow);

    public SchedulingReminderAnchor(string value)
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
    public static SchedulingReminderAnchor FromCustom(string value)
    {
        return new SchedulingReminderAnchor(value);
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

    public static bool operator ==(SchedulingReminderAnchor value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingReminderAnchor value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingReminderAnchor value) => value.Value;

    public static explicit operator SchedulingReminderAnchor(string value) => new(value);

    internal class SchedulingReminderAnchorSerializer : JsonConverter<SchedulingReminderAnchor>
    {
        public override SchedulingReminderAnchor Read(
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
            return new SchedulingReminderAnchor(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingReminderAnchor value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingReminderAnchor ReadAsPropertyName(
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
            return new SchedulingReminderAnchor(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingReminderAnchor value,
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
        public const string Start = "start";

        public const string End = "end";

        public const string Confirmed = "confirmed";

        public const string Rescheduled = "rescheduled";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";

        public const string PendingApproval = "pending_approval";

        public const string NoShow = "no_show";
    }
}
